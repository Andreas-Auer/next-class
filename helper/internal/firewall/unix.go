// Copyright (c) 2026 Andreas Auer (Next-Class, fork of Next-Exam)
// SPDX-License-Identifier: GPL-3.0-or-later

package firewall

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/Andreas-Auer/next-class/helper/internal/netrules"
)

func joinPrefixes(plan netrules.Plan) []string {
	out := make([]string, len(plan.AllowV4))
	for i, p := range plan.AllowV4 {
		out[i] = p.String()
	}
	return out
}

func joinDNS(plan netrules.Plan) []string {
	out := make([]string, len(plan.DNSv4))
	for i, a := range plan.DNSv4 {
		out[i] = a.String()
	}
	return out
}

func joinV6() []string {
	out := make([]string, len(netrules.AllowedV6))
	for i, p := range netrules.AllowedV6 {
		out[i] = p.String()
	}
	return out
}

// ---------------------------------------------------------------------------- macOS pf

// PF loads the rules into the anchor com.apple/250.NextClass. macOS' /etc/pf.conf already
// evaluates all com.apple/* anchors, so the system configuration file is never modified.
type PF struct {
	Run   Runner
	token string // pfctl -E reference; released on Remove so pf returns to its previous state
}

const pfAnchor = "com.apple/250.NextClass"

func (p *PF) Name() string { return "pf" }

// PFRules renders the anchor rules ("quick": the first matching rule decides).
func PFRules(plan netrules.Plan) string {
	var b strings.Builder
	b.WriteString("# Next-Class Internetsperre\n")
	b.WriteString("pass out quick on lo0 all\n")
	fmt.Fprintf(&b, "pass out quick inet from any to { %s }\n", strings.Join(joinPrefixes(plan), ", "))
	if dns := joinDNS(plan); len(dns) > 0 {
		fmt.Fprintf(&b, "pass out quick inet proto { tcp, udp } from any to { %s } port 53\n", strings.Join(dns, ", "))
	}
	b.WriteString("block drop out quick inet all\n")
	fmt.Fprintf(&b, "pass out quick inet6 from any to { %s }\n", strings.Join(joinV6(), ", "))
	b.WriteString("block drop out quick inet6 all\n")
	return b.String()
}

var pfTokenRe = regexp.MustCompile(`Token\s*:\s*(\d+)`)

func (p *PF) Apply(plan netrules.Plan) error {
	// make sure the main ruleset references the com.apple anchors (it does by default)
	if out, err := p.Run("/sbin/pfctl", []string{"-s", "Anchors"}, ""); err != nil || !strings.Contains(out, "com.apple") {
		if _, err := p.Run("/sbin/pfctl", []string{"-f", "/etc/pf.conf"}, ""); err != nil {
			return err
		}
	}
	if _, err := p.Run("/sbin/pfctl", []string{"-a", pfAnchor, "-f", "-"}, PFRules(plan)); err != nil {
		return err
	}
	if p.token == "" {
		out, err := p.Run("/sbin/pfctl", []string{"-E"}, "")
		if err != nil {
			return err
		}
		if m := pfTokenRe.FindStringSubmatch(out); m != nil {
			p.token = m[1]
		}
	}
	return nil
}

func (p *PF) Remove() error {
	_, err := p.Run("/sbin/pfctl", []string{"-a", pfAnchor, "-F", "all"}, "")
	if p.token != "" {
		_, _ = p.Run("/sbin/pfctl", []string{"-X", p.token}, "")
		p.token = ""
	}
	if err != nil && strings.Contains(err.Error(), "No such file") {
		return nil
	}
	return err
}

func (p *PF) Check() (bool, string) {
	info, err := p.Run("/sbin/pfctl", []string{"-s", "info"}, "")
	if err != nil {
		return false, "check-failed"
	}
	if !strings.Contains(info, "Status: Enabled") {
		return false, "firewall-disabled"
	}
	rules, err := p.Run("/sbin/pfctl", []string{"-a", pfAnchor, "-s", "rules"}, "")
	if err != nil || !strings.Contains(rules, "block drop out") {
		return false, "rules-missing"
	}
	return true, ""
}

// ---------------------------------------------------------------------------- Linux nftables

// NFT uses its own table "inet nextclass". A drop in any base chain is final, so rules of
// ufw/firewalld cannot let blocked traffic through.
type NFT struct {
	Run Runner
}

func (n *NFT) Name() string { return "nftables" }

// NFTRules renders the complete table (the leading add+delete replaces an old table atomically).
func NFTRules(plan netrules.Plan) string {
	var b strings.Builder
	b.WriteString("add table inet nextclass\ndelete table inet nextclass\n")
	b.WriteString("table inet nextclass {\n  chain out {\n    type filter hook output priority 0; policy accept;\n")
	b.WriteString("    oifname \"lo\" accept\n")
	fmt.Fprintf(&b, "    ip daddr { %s } accept\n", strings.Join(joinPrefixes(plan), ", "))
	if dns := joinDNS(plan); len(dns) > 0 {
		fmt.Fprintf(&b, "    ip daddr { %s } tcp dport 53 accept\n", strings.Join(dns, ", "))
		fmt.Fprintf(&b, "    ip daddr { %s } udp dport 53 accept\n", strings.Join(dns, ", "))
	}
	b.WriteString("    meta nfproto ipv4 drop\n")
	fmt.Fprintf(&b, "    ip6 daddr { %s } accept\n", strings.Join(joinV6(), ", "))
	b.WriteString("    meta nfproto ipv6 drop\n  }\n}\n")
	return b.String()
}

func (n *NFT) Apply(plan netrules.Plan) error {
	_, err := n.Run("nft", []string{"-f", "-"}, NFTRules(plan))
	return err
}

func (n *NFT) Remove() error {
	_, err := n.Run("nft", []string{"delete", "table", "inet", "nextclass"}, "")
	if err != nil && (strings.Contains(err.Error(), "No such file") || strings.Contains(err.Error(), "does not exist")) {
		return nil
	}
	return err
}

func (n *NFT) Check() (bool, string) {
	out, err := n.Run("nft", []string{"list", "table", "inet", "nextclass"}, "")
	if err != nil || !strings.Contains(out, "drop") {
		return false, "rules-missing"
	}
	return true, ""
}
