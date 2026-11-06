// SPDX-License-Identifier: GPL-3.0-or-later
package lock

import (
	"testing"
	"time"

	"github.com/Andreas-Auer/next-class/helper/internal/firewall"
)

type clock struct{ t time.Time }

func (c *clock) now() time.Time { return c.t }

func setup() (*Manager, *firewall.DryRun, *clock) {
	d := firewall.NewDryRun()
	m := New(d)
	c := &clock{t: time.Date(2026, 11, 6, 8, 0, 0, 0, time.Local)}
	m.now = c.now
	return m, d, c
}

func req(c *clock, d time.Duration) Request {
	return Request{Until: c.t.Add(d).UnixMilli(), Allow: []string{"10.20.0.0/16"}, DNS: []string{"10.20.0.2"}}
}

func TestLockExpiresAtEndTime(t *testing.T) {
	m, d, c := setup()
	if err := m.Lock(req(c, 55*time.Minute)); err != nil {
		t.Fatal(err)
	}
	if active, _ := d.Snapshot(); !active {
		t.Fatal("rules not applied")
	}
	c.t = c.t.Add(54 * time.Minute)
	m.Tick()
	if !m.Status().Locked {
		t.Fatal("must still be locked before the end time")
	}
	c.t = c.t.Add(2 * time.Minute)
	m.Tick()
	if m.Status().Locked {
		t.Fatal("must be unlocked after the end time")
	}
	if active, _ := d.Snapshot(); active {
		t.Fatal("rules must be removed")
	}
	if m.Status().Events[0].Kind != "unlocked" || m.Status().Events[0].Detail != "expired" {
		t.Fatalf("unexpected event %+v", m.Status().Events[0])
	}
}

func TestLockIsCappedAtFourHours(t *testing.T) {
	m, _, c := setup()
	if err := m.Lock(req(c, 23*time.Hour)); err != nil { // typo: 23:00 instead of 13:00
		t.Fatal(err)
	}
	if got := time.UnixMilli(m.Status().Until).Sub(c.t); got != MaxDuration {
		t.Fatalf("until capped to %v, want %v", got, MaxDuration)
	}
}

func TestPastEndTimeIsRejected(t *testing.T) {
	m, _, c := setup()
	if err := m.Lock(Request{Until: c.t.Add(-time.Minute).UnixMilli()}); err == nil {
		t.Fatal("expected error")
	}
}

func TestWatchdogRestoresRemovedRules(t *testing.T) {
	m, d, c := setup()
	_ = m.Lock(req(c, time.Hour))
	d.Tamper()
	m.Tick()
	if ok, _ := d.Check(); !ok {
		t.Fatal("rules not restored")
	}
	ev := m.Status().Events[0]
	if ev.Kind != "restored" || ev.Detail != "rules-missing" {
		t.Fatalf("unexpected event %+v", ev)
	}
}

func TestRepeatedLockIsIdempotentAndUnlockWorks(t *testing.T) {
	m, _, c := setup()
	_ = m.Lock(req(c, time.Hour))
	_ = m.Lock(req(c, time.Hour)) // heartbeat repeats the same request
	if n := len(m.Status().Events); n != 1 {
		t.Fatalf("got %d events, want 1 (no re-apply for identical requests)", n)
	}
	_ = m.Unlock("teacher")
	if m.Status().Locked {
		t.Fatal("still locked")
	}
}

func TestCleanupAfterRestart(t *testing.T) {
	m, d, c := setup()
	_ = m.Lock(req(c, time.Hour))
	m2 := New(d) // a new process after reboot / crash
	m2.Cleanup()
	if active, _ := d.Snapshot(); active {
		t.Fatal("cleanup must remove leftover rules")
	}
}
