// Copyright (c) 2026 Andreas Auer (Next-Class, fork of Next-Exam)
// SPDX-License-Identifier: GPL-3.0-or-later

// nextclass-helper: privileged system service of the Next-Class student app.
// It installs the internet-lock firewall rules for the student app, removes them at the end
// time, after a reboot (cleanup at start) or when the lock is lifted, and repairs removed rules.
//
// Usage:
//
//	nextclass-helper install      copy to the system location, create token, register + start service (admin)
//	nextclass-helper uninstall    stop + remove service and files (admin)
//	nextclass-helper run          run in the foreground (used by the service manager)
//	nextclass-helper run --dry-run --addr 127.0.0.1:23533 --token-file /tmp/t   (tests, no firewall changes)
//	nextclass-helper version
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"time"

	"github.com/kardianos/service"

	"github.com/Andreas-Auer/next-class/helper/internal/api"
	"github.com/Andreas-Auer/next-class/helper/internal/firewall"
	"github.com/Andreas-Auer/next-class/helper/internal/install"
	"github.com/Andreas-Auer/next-class/helper/internal/lock"
)

var version = "0.1.0"

type program struct {
	addr      string
	tokenFile string
	dryRun    bool
	stop      chan struct{}
	srv       *http.Server
	manager   *lock.Manager
}

func (p *program) Start(s service.Service) error {
	token, err := install.ReadToken(p.tokenFile)
	if err != nil {
		return fmt.Errorf("token: %w", err)
	}
	backend := firewall.New(p.dryRun)
	p.manager = lock.New(backend)
	p.manager.Cleanup() // after a reboot or crash the device is always free
	p.stop = make(chan struct{})
	go p.manager.Run(3*time.Second, p.stop)

	server := &api.Server{Manager: p.manager, Token: token}
	if d, ok := backend.(*firewall.DryRun); ok {
		server.DryRun = d
	}
	ln, err := net.Listen("tcp", p.addr)
	if err != nil {
		return err
	}
	p.srv = &http.Server{Handler: server.Handler(), ReadHeaderTimeout: 5 * time.Second}
	go func() {
		if err := p.srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("http: %v", err)
		}
	}()
	log.Printf("nextclass-helper %s listening on %s (backend %s)", version, p.addr, backend.Name())
	return nil
}

func (p *program) Stop(s service.Service) error {
	if p.stop != nil {
		close(p.stop)
	}
	if p.srv != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = p.srv.Shutdown(ctx)
	}
	// Rules stay in place when the service is stopped: otherwise stopping the service would be a
	// way around the lock. They are removed at the next start (Cleanup), i.e. after a reboot at the
	// latest, and by "uninstall". The student app reports an unreachable helper to the teacher.
	return nil
}

func serviceConfig(binary string) *service.Config {
	return &service.Config{
		Name:        install.ServiceName,
		DisplayName: "Next-Class Helper",
		Description: "Internetsperre für den Next-Class-Unterrichtsmodus (nur aktiv, wenn die Lehrkraft sie einschaltet).",
		Executable:  binary,
		Arguments:   []string{"run"},
		Option:      service.KeyValue{"RunAtLoad": true, "KeepAlive": true, "OnFailure": "restart", "Restart": "always"},
	}
}

func main() {
	log.SetFlags(log.LstdFlags)
	api.Version = version
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: nextclass-helper install|uninstall|run|version")
		os.Exit(2)
	}
	binary, tokenFile := install.Paths()

	switch os.Args[1] {
	case "version":
		fmt.Println(version)

	case "run":
		fs := flag.NewFlagSet("run", flag.ExitOnError)
		addr := fs.String("addr", install.DefaultAddr, "listen address (localhost only)")
		tf := fs.String("token-file", tokenFile, "token file")
		dry := fs.Bool("dry-run", false, "do not touch the firewall (tests)")
		_ = fs.Parse(os.Args[2:])
		host, _, err := net.SplitHostPort(*addr)
		if err != nil || (host != "127.0.0.1" && host != "localhost") {
			log.Fatalf("addr must be on 127.0.0.1")
		}
		prg := &program{addr: *addr, tokenFile: *tf, dryRun: *dry}
		svc, err := service.New(prg, serviceConfig(binary))
		if err != nil {
			log.Fatal(err)
		}
		if err := svc.Run(); err != nil {
			log.Fatal(err)
		}

	case "install":
		if err := install.CopySelf(binary); err != nil {
			log.Fatalf("copy: %v", err)
		}
		if _, err := install.EnsureToken(tokenFile); err != nil {
			log.Fatalf("token: %v", err)
		}
		svc, err := service.New(&program{}, serviceConfig(binary))
		if err != nil {
			log.Fatal(err)
		}
		_ = svc.Stop()      // update: stop an older version first
		_ = svc.Uninstall() // and re-register with the current configuration
		if err := svc.Install(); err != nil {
			log.Fatalf("install service: %v", err)
		}
		if err := svc.Start(); err != nil {
			log.Fatalf("start service: %v", err)
		}
		fmt.Println("installed")

	case "uninstall":
		svc, err := service.New(&program{}, serviceConfig(binary))
		if err != nil {
			log.Fatal(err)
		}
		_ = svc.Stop()
		_ = svc.Uninstall()
		if err := firewall.New(false).Remove(); err != nil { // never leave rules behind
			log.Printf("remove rules: %v", err)
		}
		if err := install.RemoveFiles(); err != nil {
			log.Printf("remove files: %v", err)
		}
		fmt.Println("uninstalled")

	default:
		fmt.Fprintln(os.Stderr, "unknown command", os.Args[1])
		os.Exit(2)
	}
}
