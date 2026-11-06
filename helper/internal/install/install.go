// Copyright (c) 2026 Andreas Auer (Next-Class, fork of Next-Exam)
// SPDX-License-Identifier: GPL-3.0-or-later

// Package install copies the helper to a fixed system location, writes the shared token and
// registers it as a system service (Windows service, macOS LaunchDaemon, Linux systemd unit).
// Must run with admin rights; the student app starts it once with an elevation prompt.
package install

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// ServiceName is the service / LaunchDaemon label.
const ServiceName = "at.nextclass.helper"

// DefaultAddr is where the helper listens (localhost only).
const DefaultAddr = "127.0.0.1:22533"

// Paths returns the installed binary path and the token file path for this OS.
func Paths() (binary, token string) {
	switch runtime.GOOS {
	case "windows":
		pf := os.Getenv("ProgramFiles")
		if pf == "" {
			pf = `C:\Program Files`
		}
		pd := os.Getenv("ProgramData")
		if pd == "" {
			pd = `C:\ProgramData`
		}
		return filepath.Join(pf, "NextClass Helper", "nextclass-helper.exe"), filepath.Join(pd, "NextClass", "helper-token")
	case "darwin":
		return "/Library/PrivilegedHelperTools/" + ServiceName, "/Library/Application Support/NextClass/helper-token"
	default:
		return "/usr/local/lib/nextclass/nextclass-helper", "/etc/nextclass/helper-token"
	}
}

// CopySelf copies the running executable to dst (replacing an older version).
func CopySelf(dst string) error {
	src, err := os.Executable()
	if err != nil {
		return err
	}
	if src, err = filepath.EvalSymlinks(src); err != nil {
		return err
	}
	if same, _ := filepath.Abs(dst); strings.EqualFold(same, src) {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	tmp := dst + ".new"
	out, err := os.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o755)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	if err := out.Close(); err != nil {
		return err
	}
	_ = os.Remove(dst) // Windows: rename does not replace
	return os.Rename(tmp, dst)
}

// EnsureToken creates the token file if missing (readable by local users, writable by admins only).
func EnsureToken(path string) (string, error) {
	if b, err := os.ReadFile(path); err == nil && len(strings.TrimSpace(string(b))) >= 32 {
		return strings.TrimSpace(string(b)), nil
	}
	buf := make([]byte, 24)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	token := hex.EncodeToString(buf)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", err
	}
	if err := os.WriteFile(path, []byte(token+"\n"), 0o644); err != nil {
		return "", err
	}
	return token, nil
}

// ReadToken reads the token file.
func ReadToken(path string) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	t := strings.TrimSpace(string(b))
	if t == "" {
		return "", errors.New("empty token file")
	}
	return t, nil
}

// RemoveFiles deletes binary and token (uninstall).
func RemoveFiles() error {
	bin, tok := Paths()
	var errs []string
	for _, p := range []string{bin, tok} {
		if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
			errs = append(errs, err.Error())
		}
	}
	if len(errs) > 0 {
		return fmt.Errorf("%s", strings.Join(errs, "; "))
	}
	return nil
}
