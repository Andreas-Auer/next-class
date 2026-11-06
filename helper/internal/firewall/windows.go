// Copyright (c) 2026 Andreas Auer (Next-Class, fork of Next-Exam)
// SPDX-License-Identifier: GPL-3.0-or-later

package firewall

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/Andreas-Auer/next-class/helper/internal/netrules"
)

// Windows uses Windows Defender Firewall via the NetSecurity PowerShell module.
// Block rules take precedence over allow rules, so the default outbound policy stays untouched:
// one block rule for "all IPv4 except allowed", one for global IPv6, and - if the DNS servers
// are outside the allowed networks - block rules for all ports except 53 on them.
// Output is parsed only from numbers / enum values, so localized Windows versions work.
type Windows struct {
	Run           Runner
	expectedRules int
}

const winGroup = "NextClass"

func (w *Windows) Name() string { return "windows-firewall" }

func psQuote(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }

func psList(items []string) string {
	q := make([]string, len(items))
	for i, s := range items {
		q[i] = psQuote(s)
	}
	return "@(" + strings.Join(q, ",") + ")"
}

// WindowsScript renders the PowerShell script that installs the rules; returns script and rule count.
func WindowsScript(plan netrules.Plan) (string, int) {
	var ranges []string
	for _, r := range netrules.ComplementV4(plan.AllowV4) {
		ranges = append(ranges, r.String())
	}
	var b strings.Builder
	b.WriteString("$ErrorActionPreference = 'Stop'\n")
	b.WriteString("Remove-NetFirewallRule -Group " + psQuote(winGroup) + " -ErrorAction SilentlyContinue\n")
	add := func(name, display, extra string, remote []string) {
		fmt.Fprintf(&b, "New-NetFirewallRule -Name %s -DisplayName %s -Group %s -Direction Outbound -Action Block -Profile Any -Enabled True %s-RemoteAddress %s | Out-Null\n",
			psQuote(name), psQuote(display), psQuote(winGroup), extra, psList(remote))
	}
	count := 0
	add("NextClass-Block-IPv4", "Next-Class Internetsperre (IPv4)", "", ranges)
	count++
	add("NextClass-Block-IPv6", "Next-Class Internetsperre (IPv6)", "", []string{"2000::/3"})
	count++
	if len(plan.DNSv4) > 0 {
		dns := make([]string, len(plan.DNSv4))
		for i, a := range plan.DNSv4 {
			dns[i] = a.String()
		}
		for _, proto := range []string{"TCP", "UDP"} {
			add("NextClass-Block-DNS-"+proto, "Next-Class Internetsperre (DNS-Server, nur Port 53 frei, "+proto+")",
				"-Protocol "+proto+" -RemotePort @('1-52','54-65535') ", dns)
			count++
		}
	}
	// a disabled firewall profile would make the rules ineffective
	b.WriteString("Set-NetFirewallProfile -All -Enabled True\n")
	return b.String(), count
}

func (w *Windows) ps(script string) (string, error) {
	return w.Run("powershell.exe", []string{"-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", "-"}, script)
}

func (w *Windows) Apply(plan netrules.Plan) error {
	script, count := WindowsScript(plan)
	if _, err := w.ps(script); err != nil {
		return err
	}
	w.expectedRules = count
	return nil
}

func (w *Windows) Remove() error {
	_, err := w.ps("Remove-NetFirewallRule -Group " + psQuote(winGroup) + " -ErrorAction SilentlyContinue\n")
	return err
}

// Check counts enabled Next-Class rules and disabled firewall profiles.
func (w *Windows) Check() (bool, string) {
	out, err := w.ps(`$r = @(Get-NetFirewallRule -Group ` + psQuote(winGroup) + ` -ErrorAction SilentlyContinue | Where-Object { $_.Enabled -eq 'True' -and $_.Action -eq 'Block' }).Count
$p = @(Get-NetFirewallProfile | Where-Object { $_.Enabled -ne 'True' }).Count
Write-Output "$r $p"`)
	if err != nil {
		return false, "check-failed"
	}
	fields := strings.Fields(out)
	if len(fields) < 2 {
		return false, "check-failed"
	}
	rules, _ := strconv.Atoi(fields[len(fields)-2])
	disabled, _ := strconv.Atoi(fields[len(fields)-1])
	if disabled > 0 {
		return false, "firewall-disabled"
	}
	if rules < w.expectedRules {
		return false, "rules-missing"
	}
	return true, ""
}
