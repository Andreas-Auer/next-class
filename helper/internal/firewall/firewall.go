// Copyright (c) 2026 Andreas Auer (Next-Class, fork of Next-Exam)
// SPDX-License-Identifier: GPL-3.0-or-later

// Package firewall applies the internet lock with the operating system's own firewall:
// Windows Defender Firewall (block rules win over allow rules), macOS pf (own anchor),
// Linux nftables (own table). All rules carry the Next-Class name so they can always be removed.
package firewall

import (
	"bytes"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
	"sync"

	"github.com/Andreas-Auer/next-class/helper/internal/netrules"
)

// Backend is one firewall implementation.
type Backend interface {
	Name() string
	// Apply installs the lock rules (replacing earlier Next-Class rules).
	Apply(plan netrules.Plan) error
	// Remove deletes all Next-Class rules. Safe to call when nothing is installed.
	Remove() error
	// Check verifies that the rules are still in place; problem describes what is wrong.
	Check() (ok bool, problem string)
}

// Runner executes a command with optional stdin and returns combined output.
type Runner func(name string, args []string, stdin string) (string, error)

// ExecRunner runs real commands.
func ExecRunner(name string, args []string, stdin string) (string, error) {
	cmd := exec.Command(name, args...)
	if stdin != "" {
		cmd.Stdin = strings.NewReader(stdin)
	}
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	err := cmd.Run()
	if err != nil {
		return out.String(), fmt.Errorf("%s %s: %w: %s", name, strings.Join(args, " "), err, strings.TrimSpace(out.String()))
	}
	return out.String(), nil
}

// New returns the backend for this operating system (or the dry-run backend).
func New(dryRun bool) Backend {
	if dryRun {
		return NewDryRun()
	}
	switch runtime.GOOS {
	case "windows":
		return &Windows{Run: ExecRunner}
	case "darwin":
		return &PF{Run: ExecRunner}
	default:
		return &NFT{Run: ExecRunner}
	}
}

// DryRun records the rules it would install (tests, development). Never touches the system.
type DryRun struct {
	mu       sync.Mutex
	Rendered string // rules in nftables syntax, for inspection
	Active   bool
	tampered bool
}

func NewDryRun() *DryRun { return &DryRun{} }

func (d *DryRun) Name() string { return "dry-run" }

func (d *DryRun) Apply(plan netrules.Plan) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.Rendered = NFTRules(plan)
	d.Active = true
	d.tampered = false
	return nil
}

func (d *DryRun) Remove() error {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.Active = false
	d.Rendered = ""
	return nil
}

func (d *DryRun) Check() (bool, string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.tampered {
		return false, "rules-missing"
	}
	return true, ""
}

// Tamper simulates a student deleting the rules (tests only).
func (d *DryRun) Tamper() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.tampered = true
}

// Snapshot returns the current dry-run state.
func (d *DryRun) Snapshot() (bool, string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.Active, d.Rendered
}
