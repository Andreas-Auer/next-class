// SPDX-License-Identifier: GPL-3.0-or-later
package firewall

import (
	"errors"
	"strings"
	"testing"

	"github.com/Andreas-Auer/next-class/helper/internal/netrules"
)

func plan(t *testing.T) netrules.Plan {
	t.Helper()
	p, err := netrules.Build([]string{"10.20.0.0/16"}, []string{"10.20.0.2", "8.8.8.8"})
	if err != nil {
		t.Fatal(err)
	}
	return p
}

type call struct {
	name  string
	args  []string
	stdin string
}

func recorder(responses map[string]string, fail map[string]bool) (Runner, *[]call) {
	calls := &[]call{}
	return func(name string, args []string, stdin string) (string, error) {
		key := name + " " + strings.Join(args, " ")
		*calls = append(*calls, call{name, args, stdin})
		if fail[key] {
			return "", errors.New("failed: " + key)
		}
		for k, v := range responses {
			if strings.HasPrefix(key, k) {
				return v, nil
			}
		}
		return "", nil
	}, calls
}

func TestWindowsScriptBlocksComplementAndIPv6(t *testing.T) {
	script, count := WindowsScript(plan(t))
	for _, want := range []string{
		"Remove-NetFirewallRule -Group 'NextClass'",
		"-Name 'NextClass-Block-IPv4'",
		"'1.0.0.0-8.8.8.7'",           // everything below the DNS server ...
		"'8.8.8.9-10.19.255.255'",     // ... and from it up to the allowed school network
		"'10.21.0.0-126.255.255.255'", // continues right after it (127/8 loopback stays allowed)
		"-Name 'NextClass-Block-IPv6'",
		"'2000::/3'",
		"-Protocol TCP -RemotePort @('1-52','54-65535') -RemoteAddress @('8.8.8.8')",
		"Set-NetFirewallProfile -All -Enabled True",
	} {
		if !strings.Contains(script, want) {
			t.Errorf("script misses %q\n%s", want, script)
		}
	}
	// the DNS server is not in the main block rule (it would block port 53, block rules win)
	if strings.Contains(script, "'1.0.0.0-10.19.255.255'") {
		t.Errorf("main block rule must leave out the DNS server 8.8.8.8\n%s", script)
	}
	if strings.Contains(script, "'10.20.") {
		t.Error("the school network must not appear in a block rule")
	}
	if count != 4 {
		t.Errorf("rule count = %d, want 4", count)
	}
}

func TestWindowsCheckDetectsDisabledFirewallAndMissingRules(t *testing.T) {
	run, _ := recorder(map[string]string{"powershell.exe": "4 0"}, nil)
	w := &Windows{Run: run}
	if err := w.Apply(plan(t)); err != nil {
		t.Fatal(err)
	}
	if ok, _ := w.Check(); !ok {
		t.Error("expected ok")
	}
	w.Run, _ = recorder(map[string]string{"powershell.exe": "4 1"}, nil)
	if ok, p := w.Check(); ok || p != "firewall-disabled" {
		t.Errorf("got %v %q, want firewall-disabled", ok, p)
	}
	w.Run, _ = recorder(map[string]string{"powershell.exe": "2 0"}, nil)
	if ok, p := w.Check(); ok || p != "rules-missing" {
		t.Errorf("got %v %q, want rules-missing", ok, p)
	}
	// helper restarted (no Apply in this process) and no rules present
	fresh := &Windows{}
	fresh.Run, _ = recorder(map[string]string{"powershell.exe": "0 0"}, nil)
	if ok, p := fresh.Check(); ok || p != "rules-missing" {
		t.Errorf("fresh: got %v %q, want rules-missing", ok, p)
	}
}

func TestPFRulesOrderAndContent(t *testing.T) {
	rules := PFRules(plan(t))
	lo := strings.Index(rules, "pass out quick on lo0")
	allow := strings.Index(rules, "pass out quick inet from any to {")
	block := strings.Index(rules, "block drop out quick inet all")
	if !(lo >= 0 && lo < allow && allow < block) {
		t.Fatalf("wrong rule order:\n%s", rules)
	}
	if !strings.Contains(rules, "10.20.0.0/16") || !strings.Contains(rules, "to { 8.8.8.8 } port 53") {
		t.Errorf("missing allowed network or DNS:\n%s", rules)
	}
	if !strings.Contains(rules, "block drop out quick inet6 all") {
		t.Error("IPv6 must be blocked")
	}
}

func TestPFApplyEnablesWithTokenAndRemoveReleasesIt(t *testing.T) {
	run, calls := recorder(map[string]string{
		"/sbin/pfctl -s Anchors": "  com.apple\n",
		"/sbin/pfctl -E":         "pf enabled\nToken : 12345678\n",
	}, nil)
	p := &PF{Run: run}
	if err := p.Apply(plan(t)); err != nil {
		t.Fatal(err)
	}
	if p.token != "12345678" {
		t.Fatalf("token = %q", p.token)
	}
	if err := p.Remove(); err != nil {
		t.Fatal(err)
	}
	last := (*calls)[len(*calls)-1]
	if strings.Join(last.args, " ") != "-X 12345678" {
		t.Errorf("last call %v, want pfctl -X 12345678", last.args)
	}
}

func TestNFTRulesAreSelfContained(t *testing.T) {
	rules := NFTRules(plan(t))
	for _, want := range []string{
		"delete table inet nextclass",
		"type filter hook output priority 0; policy accept;",
		"oifname \"lo\" accept",
		"ip daddr { 10.20.0.0/16",
		"ip daddr { 8.8.8.8 } udp dport 53 accept",
		"meta nfproto ipv4 drop",
		"meta nfproto ipv6 drop",
	} {
		if !strings.Contains(rules, want) {
			t.Errorf("nft rules miss %q\n%s", want, rules)
		}
	}
}

func TestDryRunTamper(t *testing.T) {
	d := NewDryRun()
	_ = d.Apply(plan(t))
	if ok, _ := d.Check(); !ok {
		t.Fatal("expected ok")
	}
	d.Tamper()
	if ok, p := d.Check(); ok || p != "rules-missing" {
		t.Fatalf("got %v %q", ok, p)
	}
	_ = d.Apply(plan(t))
	if ok, _ := d.Check(); !ok {
		t.Fatal("apply must repair")
	}
}
