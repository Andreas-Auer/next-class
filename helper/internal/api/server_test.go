// SPDX-License-Identifier: GPL-3.0-or-later
package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Andreas-Auer/next-class/helper/internal/firewall"
	"github.com/Andreas-Auer/next-class/helper/internal/lock"
)

func server() (*Server, http.Handler) {
	d := firewall.NewDryRun()
	s := &Server{Manager: lock.New(d), Token: "secret", DryRun: d}
	return s, s.Handler()
}

func do(h http.Handler, method, path, body string, mod func(*http.Request)) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, "http://127.0.0.1:22533"+path, strings.NewReader(body))
	req.Header.Set(TokenHeader, "secret")
	if mod != nil {
		mod(req)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestRejectsMissingTokenBrowserAndForeignHost(t *testing.T) {
	_, h := server()
	if rec := do(h, "GET", "/v1/status", "", func(r *http.Request) { r.Header.Del(TokenHeader) }); rec.Code != http.StatusUnauthorized {
		t.Errorf("no token: %d", rec.Code)
	}
	if rec := do(h, "GET", "/v1/status", "", func(r *http.Request) { r.Header.Set("Origin", "https://evil.example") }); rec.Code != http.StatusForbidden {
		t.Errorf("browser origin: %d", rec.Code)
	}
	if rec := do(h, "GET", "/v1/status", "", func(r *http.Request) { r.Host = "evil.example:22533" }); rec.Code != http.StatusForbidden {
		t.Errorf("dns rebinding host: %d", rec.Code)
	}
}

func TestLockStatusUnlockRoundTrip(t *testing.T) {
	_, h := server()
	until := time.Now().Add(time.Hour).UnixMilli()
	body := `{"until":` + jsonInt(until) + `,"allow":["10.20.0.0/16"],"dns":["8.8.8.8"]}`
	if rec := do(h, "POST", "/v1/lock", body, nil); rec.Code != http.StatusOK {
		t.Fatalf("lock: %d %s", rec.Code, rec.Body)
	}
	var st struct {
		Locked bool `json:"locked"`
		DryRun bool `json:"dryRun"`
	}
	_ = json.Unmarshal(do(h, "GET", "/v1/status", "", nil).Body.Bytes(), &st)
	if !st.Locked || !st.DryRun {
		t.Fatalf("status %+v", st)
	}
	if rec := do(h, "POST", "/v1/unlock", "", nil); rec.Code != http.StatusOK {
		t.Fatalf("unlock: %d", rec.Code)
	}
}

func TestLockRejectsInvalidRequests(t *testing.T) {
	_, h := server()
	if rec := do(h, "POST", "/v1/lock", `{"until":1,"allow":[]}`, nil); rec.Code != http.StatusBadRequest {
		t.Errorf("past end time: %d", rec.Code)
	}
	until := jsonInt(time.Now().Add(time.Hour).UnixMilli())
	if rec := do(h, "POST", "/v1/lock", `{"until":`+until+`,"allow":["0.0.0.0/0"]}`, nil); rec.Code != http.StatusBadRequest {
		t.Errorf("allow everything: %d", rec.Code)
	}
	if rec := do(h, "GET", "/v1/lock", "", nil); rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("GET lock: %d", rec.Code)
	}
}

func jsonInt(v int64) string {
	b, _ := json.Marshal(v)
	return string(b)
}
