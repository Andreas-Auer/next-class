// SPDX-License-Identifier: GPL-3.0-or-later
package firewall

import (
	"net"
	"os"
	"testing"
	"time"

	"github.com/Andreas-Auer/next-class/helper/internal/netrules"
)

// TestRealFirewall installs the lock with the real firewall of this OS, checks what is blocked
// and removes it again. It changes the system firewall for a few seconds, so it only runs when
// NC_REAL_FIREWALL=1 is set: in CI on throw-away runners (as admin/root), never on a normal computer.
//
//	allowed network 1.1.1.1      -> reachable
//	DNS server 8.8.8.8           -> port 53 reachable, port 443 blocked
//	everything else (9.9.9.9)    -> blocked
func TestRealFirewall(t *testing.T) {
	if os.Getenv("NC_REAL_FIREWALL") != "1" {
		t.Skip("set NC_REAL_FIREWALL=1 (admin/root, throw-away machine only)")
	}
	reach := func(addr string) bool {
		c, err := net.DialTimeout("tcp", addr, 4*time.Second)
		if err != nil {
			return false
		}
		_ = c.Close()
		return true
	}
	// a public server can drop a single connection: only three failures in a row count as unreachable
	reachRetry := func(addr string) bool {
		for i := 0; i < 3; i++ {
			if reach(addr) {
				return true
			}
			time.Sleep(time.Second)
		}
		return false
	}
	targets := []string{"1.1.1.1:443", "8.8.8.8:53", "8.8.8.8:443", "9.9.9.9:443"}
	for _, a := range targets {
		if !reachRetry(a) {
			t.Skipf("%s not reachable before the lock - no internet on this machine", a)
		}
	}

	plan, err := netrules.Build([]string{"1.1.1.1"}, []string{"8.8.8.8"})
	if err != nil {
		t.Fatal(err)
	}
	backend := New(false)
	t.Logf("backend %s", backend.Name())
	if ok, _ := backend.Check(); ok {
		t.Fatal("Check reports a lock before Apply")
	}
	removed := false
	defer func() {
		if !removed {
			_ = backend.Remove() // never leave the runner locked
		}
	}()
	if err := backend.Apply(plan); err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if ok, problem := backend.Check(); !ok {
		t.Errorf("Check after Apply: %s", problem)
	}
	want := map[string]bool{"1.1.1.1:443": true, "8.8.8.8:53": true, "8.8.8.8:443": false, "9.9.9.9:443": false}
	for _, a := range targets {
		got := reach(a)
		if want[a] && !got {
			got = reachRetry(a)
		}
		if got != want[a] {
			t.Errorf("locked: %s reachable=%v, want %v", a, got, want[a])
		}
	}
	// applying again (e.g. new exceptions) must replace the rules, not stack them
	if err := backend.Apply(plan); err != nil {
		t.Errorf("second Apply: %v", err)
	}

	if err := backend.Remove(); err != nil {
		t.Fatalf("Remove: %v", err)
	}
	removed = true
	if ok, _ := backend.Check(); ok {
		t.Error("Check still reports the lock after Remove")
	}
	if err := backend.Remove(); err != nil {
		t.Errorf("second Remove must be harmless: %v", err)
	}
	for _, a := range targets {
		if !reachRetry(a) {
			t.Errorf("after Remove: %s still blocked", a)
		}
	}
}
