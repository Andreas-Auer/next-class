// Copyright (c) 2026 Andreas Auer (Next-Class, fork of Next-Exam)
// SPDX-License-Identifier: GPL-3.0-or-later

// Package lock holds the internet-lock state: rules are installed until the end time
// (the teacher's lesson end + grace) and removed automatically afterwards - also when the
// student app or the teacher is gone. A watchdog re-installs removed rules and records events.
package lock

import (
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/Andreas-Auer/next-class/helper/internal/firewall"
	"github.com/Andreas-Auer/next-class/helper/internal/netrules"
)

// MaxDuration is the hard upper limit of a lock (protects against wrong end times).
const MaxDuration = 4 * time.Hour

// MaxEvents is the number of events kept in memory.
const MaxEvents = 50

// Request is sent by the student app.
type Request struct {
	Until     int64    `json:"until"`     // unix ms; lock ends automatically at this time
	Allow     []string `json:"allow"`     // networks that stay reachable (school subnet, teacher, drives)
	DNS       []string `json:"dns"`       // DNS servers (port 53 stays open)
	SessionID string   `json:"sessionId"` // for logs only
}

// Event is something the teacher should know about.
type Event struct {
	At     int64  `json:"at"` // unix ms
	Kind   string `json:"kind"`
	Detail string `json:"detail,omitempty"`
}

// Status is returned by the API.
type Status struct {
	Locked  bool     `json:"locked"`
	Until   int64    `json:"until,omitempty"`
	Allow   []string `json:"allow,omitempty"`
	DNS     []string `json:"dns,omitempty"`
	Backend string   `json:"backend"`
	Events  []Event  `json:"events"`
	Error   string   `json:"error,omitempty"`
}

// Manager serializes all firewall operations.
type Manager struct {
	mu      sync.Mutex
	backend firewall.Backend
	now     func() time.Time
	locked  bool
	until   time.Time
	plan    netrules.Plan
	req     Request
	events  []Event
	lastErr string
}

func New(backend firewall.Backend) *Manager {
	return &Manager{backend: backend, now: time.Now}
}

func (m *Manager) event(kind, detail string) {
	m.events = append([]Event{{At: m.now().UnixMilli(), Kind: kind, Detail: detail}}, m.events...)
	if len(m.events) > MaxEvents {
		m.events = m.events[:MaxEvents]
	}
	log.Printf("event %s %s", kind, detail)
}

// Cleanup removes leftover rules (called at start: after a reboot or crash the device is free).
func (m *Manager) Cleanup() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if err := m.backend.Remove(); err != nil {
		log.Printf("cleanup: %v", err)
	}
	m.locked = false
}

// Lock installs or updates the lock. Idempotent: the student app calls it with every heartbeat.
func (m *Manager) Lock(req Request) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := m.now()
	until := time.UnixMilli(req.Until)
	if !until.After(now) {
		return fmt.Errorf("end time is in the past")
	}
	if max := now.Add(MaxDuration); until.After(max) {
		until = max
	}
	plan, err := netrules.Build(req.Allow, req.DNS)
	if err != nil {
		return err
	}
	changed := !m.locked || !samePlan(plan, m.plan)
	if changed {
		if err := m.backend.Apply(plan); err != nil {
			m.lastErr = err.Error()
			m.event("apply-failed", err.Error())
			return err
		}
		m.lastErr = ""
		if !m.locked {
			m.event("locked", fmt.Sprintf("until %s", until.Format("15:04")))
		} else {
			m.event("updated", "")
		}
	}
	m.locked = true
	m.until = until
	m.plan = plan
	m.req = req
	return nil
}

// Unlock removes the rules.
func (m *Manager) Unlock(reason string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.unlockLocked(reason)
}

func (m *Manager) unlockLocked(reason string) error {
	if err := m.backend.Remove(); err != nil {
		m.lastErr = err.Error()
		m.event("remove-failed", err.Error())
		return err
	}
	if m.locked {
		m.event("unlocked", reason)
	}
	m.locked = false
	m.lastErr = ""
	return nil
}

// Tick: end the lock when its time is over, otherwise verify and repair the rules.
func (m *Manager) Tick() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if !m.locked {
		return
	}
	if !m.now().Before(m.until) {
		_ = m.unlockLocked("expired")
		return
	}
	ok, problem := m.backend.Check()
	if ok {
		return
	}
	if err := m.backend.Apply(m.plan); err != nil {
		m.lastErr = err.Error()
		m.event("restore-failed", problem+": "+err.Error())
		return
	}
	m.event("restored", problem) // somebody removed the rules or disabled the firewall
}

// Run ticks until stop is closed.
func (m *Manager) Run(interval time.Duration, stop <-chan struct{}) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-t.C:
			m.Tick()
		case <-stop:
			return
		}
	}
}

func (m *Manager) Status() Status {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := Status{Locked: m.locked, Backend: m.backend.Name(), Events: append([]Event{}, m.events...), Error: m.lastErr}
	if m.locked {
		s.Until = m.until.UnixMilli()
		s.Allow = m.req.Allow
		s.DNS = m.req.DNS
	}
	return s
}

func samePlan(a, b netrules.Plan) bool {
	if len(a.AllowV4) != len(b.AllowV4) || len(a.DNSv4) != len(b.DNSv4) {
		return false
	}
	for i := range a.AllowV4 {
		if a.AllowV4[i] != b.AllowV4[i] {
			return false
		}
	}
	for i := range a.DNSv4 {
		if a.DNSv4[i] != b.DNSv4[i] {
			return false
		}
	}
	return true
}
