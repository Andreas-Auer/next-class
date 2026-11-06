// SPDX-License-Identifier: GPL-3.0-or-later
package netrules

import (
	"math/big"
	"net/netip"
	"testing"
)

func inRanges(ranges []Range, s string) bool {
	a := netip.MustParseAddr(s)
	for _, r := range ranges {
		if !a.Less(r.From) && !r.To.Less(a) {
			return true
		}
	}
	return false
}

func TestComplementBlocksInternetButNotSchoolNetwork(t *testing.T) {
	plan, err := Build([]string{"10.20.0.0/16", "10.99.1.5"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	blocked := ComplementV4(plan.AllowV4)
	for _, ip := range []string{"8.8.8.8", "1.1.1.1", "142.250.185.78", "192.168.1.1", "172.20.10.1", "10.21.0.1"} {
		if !inRanges(blocked, ip) {
			t.Errorf("%s should be blocked", ip)
		}
	}
	for _, ip := range []string{"10.20.0.1", "10.20.255.254", "10.99.1.5", "127.0.0.1", "169.254.10.10", "224.0.0.251", "239.255.42.1", "255.255.255.255"} {
		if inRanges(blocked, ip) {
			t.Errorf("%s must stay reachable", ip)
		}
	}
}

func TestPhoneHotspotIsBlocked(t *testing.T) {
	// school WLAN 10.10.0.0/22 - an iPhone hotspot (172.20.10.0/28) or home router (192.168.0.0/24) must be blocked
	plan, _ := Build([]string{"10.10.0.0/22"}, nil)
	blocked := ComplementV4(plan.AllowV4)
	for _, ip := range []string{"172.20.10.1", "192.168.0.1", "192.168.43.1"} {
		if !inRanges(blocked, ip) {
			t.Errorf("hotspot/home address %s should be blocked", ip)
		}
	}
}

func TestComplementPlusAllowedCoversEverything(t *testing.T) {
	plan, _ := Build([]string{"10.0.0.0/8", "192.168.5.0/24", "192.168.5.7", "172.16.0.0/12"}, nil)
	blocked := CountV4(ComplementV4(plan.AllowV4))
	allowed := new(big.Int)
	for _, p := range plan.AllowV4 {
		allowed.Add(allowed, new(big.Int).Lsh(big.NewInt(1), uint(32-p.Bits())))
	}
	allowed.Add(allowed, big.NewInt(1<<24)) // 0.0.0.0/8 is neither blocked nor allowed explicitly
	total := new(big.Int).Add(blocked, allowed)
	if total.Cmp(new(big.Int).Lsh(big.NewInt(1), 32)) != 0 {
		t.Fatalf("blocked + allowed = %s, want 2^32", total)
	}
}

func TestMergeRemovesNestedPrefixes(t *testing.T) {
	got := Merge([]netip.Prefix{
		netip.MustParsePrefix("10.1.2.0/24"),
		netip.MustParsePrefix("10.0.0.0/8"),
		netip.MustParsePrefix("192.168.1.0/24"),
		netip.MustParsePrefix("10.200.0.0/16"),
	})
	if len(got) != 2 || got[0].String() != "10.0.0.0/8" || got[1].String() != "192.168.1.0/24" {
		t.Fatalf("unexpected merge result %v", got)
	}
}

func TestDNSOutsideAllowedGetsPort53Only(t *testing.T) {
	plan, _ := Build([]string{"10.20.0.0/16"}, []string{"10.20.0.2", "8.8.8.8", "8.8.8.8", "fe80::1", "nonsense"})
	if len(plan.DNSv4) != 1 || plan.DNSv4[0].String() != "8.8.8.8" {
		t.Fatalf("DNSv4 = %v, want [8.8.8.8]", plan.DNSv4)
	}
}

func TestRejectsHugeOrInvalidNetworks(t *testing.T) {
	if _, err := Build([]string{"0.0.0.0/0"}, nil); err == nil {
		t.Error("0.0.0.0/0 must be rejected (would disable the lock)")
	}
	if _, err := Build([]string{"not-an-ip"}, nil); err == nil {
		t.Error("invalid input must be rejected")
	}
	many := make([]string, MaxAllowed+1)
	for i := range many {
		many[i] = "10.0.0.1"
	}
	if _, err := Build(many, nil); err == nil {
		t.Error("too many networks must be rejected")
	}
}
