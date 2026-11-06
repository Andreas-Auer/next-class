// Copyright (c) 2026 Andreas Auer (Next-Class, fork of Next-Exam)
// SPDX-License-Identifier: GPL-3.0-or-later

// Package netrules computes which destinations stay reachable during an internet lock.
//
// The lock is "block everything except": the school network (subnet of the teacher connection,
// network drives), local infrastructure (loopback, link-local, multicast, broadcast) and the DNS
// servers (port 53 only when they are outside the allowed networks).
package netrules

import (
	"errors"
	"fmt"
	"math/big"
	"net/netip"
	"sort"
)

// MaxAllowed limits the number of allowed networks a client may send.
const MaxAllowed = 256

// AlwaysAllowedV4 are needed for the local machine and the LAN to work at all.
var AlwaysAllowedV4 = []netip.Prefix{
	netip.MustParsePrefix("127.0.0.0/8"),        // loopback
	netip.MustParsePrefix("169.254.0.0/16"),     // link-local
	netip.MustParsePrefix("224.0.0.0/4"),        // multicast (Next-Class discovery, mDNS)
	netip.MustParsePrefix("255.255.255.255/32"), // broadcast (DHCP)
}

// AllowedV6 are the IPv6 destinations that stay reachable; all other IPv6 traffic is blocked.
var AllowedV6 = []netip.Prefix{
	netip.MustParsePrefix("::1/128"),   // loopback
	netip.MustParsePrefix("fe80::/10"), // link-local
	netip.MustParsePrefix("fc00::/7"),  // unique local (school LANs)
	netip.MustParsePrefix("ff00::/8"),  // multicast
}

// Plan is the normalized result: what is allowed for IPv4 and which DNS servers get port 53.
type Plan struct {
	AllowV4 []netip.Prefix // merged, sorted, includes AlwaysAllowedV4
	DNSv4   []netip.Addr   // DNS servers outside AllowV4 (reachable on port 53 only)
}

// Build validates the client input and produces a Plan.
func Build(allow []string, dns []string) (Plan, error) {
	if len(allow) > MaxAllowed {
		return Plan{}, fmt.Errorf("too many allowed networks (%d > %d)", len(allow), MaxAllowed)
	}
	prefixes := append([]netip.Prefix{}, AlwaysAllowedV4...)
	for _, s := range allow {
		p, err := parsePrefixOrAddr(s)
		if err != nil {
			return Plan{}, err
		}
		if !p.Addr().Is4() {
			continue // IPv6 allowances are fixed (AllowedV6)
		}
		if p.Bits() < 8 {
			return Plan{}, fmt.Errorf("network %s is too large to be a school network", p)
		}
		prefixes = append(prefixes, p.Masked())
	}
	plan := Plan{AllowV4: Merge(prefixes)}
	seen := map[netip.Addr]bool{}
	for _, s := range dns {
		a, err := netip.ParseAddr(s)
		if err != nil || !a.Is4() || seen[a] {
			continue
		}
		seen[a] = true
		if !contains(plan.AllowV4, a) {
			plan.DNSv4 = append(plan.DNSv4, a)
		}
	}
	sort.Slice(plan.DNSv4, func(i, j int) bool { return plan.DNSv4[i].Less(plan.DNSv4[j]) })
	return plan, nil
}

func parsePrefixOrAddr(s string) (netip.Prefix, error) {
	if p, err := netip.ParsePrefix(s); err == nil {
		return p, nil
	}
	if a, err := netip.ParseAddr(s); err == nil {
		return netip.PrefixFrom(a, a.BitLen()), nil
	}
	return netip.Prefix{}, fmt.Errorf("invalid network %q", s)
}

func contains(prefixes []netip.Prefix, a netip.Addr) bool {
	for _, p := range prefixes {
		if p.Contains(a) {
			return true
		}
	}
	return false
}

// Range is an inclusive IPv4 address range.
type Range struct{ From, To netip.Addr }

func (r Range) String() string {
	if r.From == r.To {
		return r.From.String()
	}
	return r.From.String() + "-" + r.To.String()
}

func toInt(a netip.Addr) uint64 {
	b := a.As4()
	return uint64(b[0])<<24 | uint64(b[1])<<16 | uint64(b[2])<<8 | uint64(b[3])
}

func fromInt(v uint64) netip.Addr {
	return netip.AddrFrom4([4]byte{byte(v >> 24), byte(v >> 16), byte(v >> 8), byte(v)})
}

func prefixRange(p netip.Prefix) (uint64, uint64) {
	start := toInt(p.Masked().Addr())
	size := uint64(1) << (32 - p.Bits())
	return start, start + size - 1
}

// Merge sorts IPv4 prefixes and removes prefixes contained in others.
func Merge(prefixes []netip.Prefix) []netip.Prefix {
	ps := append([]netip.Prefix{}, prefixes...)
	sort.Slice(ps, func(i, j int) bool {
		si, _ := prefixRange(ps[i])
		sj, _ := prefixRange(ps[j])
		if si != sj {
			return si < sj
		}
		return ps[i].Bits() < ps[j].Bits()
	})
	// CIDR blocks are either nested or disjoint: after sorting, a block is redundant
	// exactly when it ends inside the last kept block.
	out := []netip.Prefix{}
	var lastEnd uint64
	for _, p := range ps {
		_, e := prefixRange(p)
		if len(out) > 0 && e <= lastEnd {
			continue
		}
		out = append(out, p)
		lastEnd = e
	}
	return out
}

// ComplementV4 returns the IPv4 ranges that are NOT covered by the allowed prefixes
// (i.e. everything that must be blocked). 0.0.0.0/8 is never listed.
func ComplementV4(allowed []netip.Prefix) []Range {
	type span struct{ s, e uint64 }
	spans := []span{{0, 0x00FFFFFF}} // treat 0.0.0.0/8 as covered ("this network", not routable)
	for _, p := range allowed {
		if !p.Addr().Is4() {
			continue
		}
		s, e := prefixRange(p)
		spans = append(spans, span{s, e})
	}
	sort.Slice(spans, func(i, j int) bool { return spans[i].s < spans[j].s })
	var out []Range
	var next uint64 // first address not yet covered
	for _, sp := range spans {
		if sp.s > next {
			out = append(out, Range{fromInt(next), fromInt(sp.s - 1)})
		}
		if sp.e+1 > next {
			next = sp.e + 1
		}
	}
	if next <= 0xFFFFFFFF {
		out = append(out, Range{fromInt(next), fromInt(0xFFFFFFFF)})
	}
	return out
}

// CountV4 returns how many addresses the ranges cover (for tests and logging).
func CountV4(ranges []Range) *big.Int {
	total := new(big.Int)
	for _, r := range ranges {
		total.Add(total, new(big.Int).SetUint64(toInt(r.To)-toInt(r.From)+1))
	}
	return total
}

// ErrNotLocked is returned when an operation needs an active lock.
var ErrNotLocked = errors.New("not locked")
