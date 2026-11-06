// Copyright (c) 2026 Andreas Auer (Next-Class, fork of Next-Exam)
// SPDX-License-Identifier: GPL-3.0-or-later

// Package api is the local HTTP interface between the student app and the helper.
// It listens on 127.0.0.1 only and every request must carry the token from the token file
// (readable by local users, written at installation). Requests from web pages are rejected
// (Origin header, Host check against DNS rebinding).
package api

import (
	"crypto/subtle"
	"encoding/json"
	"net"
	"net/http"
	"strings"

	"github.com/Andreas-Auer/next-class/helper/internal/firewall"
	"github.com/Andreas-Auer/next-class/helper/internal/lock"
)

// TokenHeader carries the shared token.
const TokenHeader = "X-NextClass-Token"

// Version of the helper (reported by /v1/status).
var Version = "dev"

type Server struct {
	Manager *lock.Manager
	Token   string
	DryRun  *firewall.DryRun // non-nil in dry-run mode: enables the test endpoints
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/status", s.status)
	mux.HandleFunc("/v1/lock", s.lock)
	mux.HandleFunc("/v1/unlock", s.unlock)
	if s.DryRun != nil {
		mux.HandleFunc("/v1/dryrun/tamper", s.tamper)
		mux.HandleFunc("/v1/dryrun/rules", s.rules)
	}
	return s.guard(mux)
}

func (s *Server) guard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host, _, err := net.SplitHostPort(r.Host)
		if err != nil {
			host = r.Host
		}
		if host != "127.0.0.1" && host != "localhost" {
			http.Error(w, "forbidden host", http.StatusForbidden)
			return
		}
		if r.Header.Get("Origin") != "" {
			http.Error(w, "browsers are not allowed", http.StatusForbidden)
			return
		}
		got := r.Header.Get(TokenHeader)
		if s.Token == "" || subtle.ConstantTimeCompare([]byte(got), []byte(s.Token)) != 1 {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

type statusResponse struct {
	lock.Status
	Version string `json:"version"`
	DryRun  bool   `json:"dryRun"`
}

func (s *Server) status(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, statusResponse{Status: s.Manager.Status(), Version: Version, DryRun: s.DryRun != nil})
}

func (s *Server) lock(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	var req lock.Request
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64*1024)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if err := s.Manager.Lock(req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, s.Manager.Status())
}

func (s *Server) unlock(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	reason := strings.TrimSpace(r.URL.Query().Get("reason"))
	if reason == "" {
		reason = "teacher"
	}
	if err := s.Manager.Unlock(reason); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, s.Manager.Status())
}

func (s *Server) tamper(w http.ResponseWriter, r *http.Request) {
	s.DryRun.Tamper()
	writeJSON(w, http.StatusOK, map[string]bool{"tampered": true})
}

func (s *Server) rules(w http.ResponseWriter, r *http.Request) {
	active, rendered := s.DryRun.Snapshot()
	writeJSON(w, http.StatusOK, map[string]any{"active": active, "rules": rendered})
}
