/**
 * @license GPL LICENSE
 * Copyright (c) 2026 Andreas Auer (Next-Class, fork of Next-Exam)
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free Software Foundation,
 * either version 3 of the License, or any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <http://www.gnu.org/licenses/>
 */

/**
 * Program lock on the student device.
 *
 * The teacher sends a policy { active, mode: 'kill' | 'report', allowed: [entries], graceSeconds }.
 * After the warning period every program that is not allowed is closed (politely first, hard after
 * 5 s) or only reported. Each action is reported to the teacher.
 *
 * Safety: unpackaged builds (npm run dev, e2e tests) never close real programs - they only report.
 */

import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import log from 'electron-log';
import { classify } from '../../../../../shared/appCatalog.js';
import { listRunningApps, closeApp, allowlistSupported, stopWatchers } from './processList.js';

const TICK_MS = 2000;
const FORCE_AFTER_MS = 10000;          // polite close first, hard kill after this (decision 2026-11-07: 10 s)
const REPORT_REPEAT_MS = 60000;        // the same program is reported at most once a minute
const RUNNING_APPS_REFRESH_MS = 15000; // list of running programs for the teacher ("übernehmen")
const MAX_VIOLATIONS = 20;
const NO_CONTACT_GRACE_MS = 5 * 60 * 1000;   // without contact the lock lasts until end time + 5 min

export class AppLock {
    constructor() {
        this.policy = { active: false };
        this.state = 'off';            // 'off' | 'grace' | 'active'
        this.graceUntil = 0;
        this.timer = null;
        this.busy = false;
        this.pendingClose = new Map(); // pid -> first close attempt (ms)
        this.lastReport = new Map();   // app key -> ms
        this.violations = [];          // newest first: { name, action, at }
        this.runningApps = [];
        this.runningAppsAt = 0;
        this.fakeApps = null;          // e2e only
        this.connected = false;        // set by the communication handler
        this.owner = null;             // "session@teacherIp" that set the lock - only it may lift it early
        this.onStateChange = null;     // callback(state) - e.g. show the student window with a countdown
        this.reportOnly = !app.isPackaged || process.env.NEXT_CLASS_APPLOCK_REPORT_ONLY === '1';
        if (this.reportOnly) log.info('applock: unpackaged build - programs are only reported, never closed');
    }

    start() {
        this.restore();
        if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS);
    }

    stateFile() {
        return process.env.NEXT_CLASS_APPLOCK_STATE || path.join(app.getPath('userData'), 'applock-state.json');
    }

    /** Keep the lock across a restart of this app (not across a reboot: then it has expired or the teacher re-sends it). */
    persist() {
        try {
            if (this.policy.active) fs.writeFileSync(this.stateFile(), JSON.stringify({ policy: this.policy, owner: this.owner }));
            else fs.rmSync(this.stateFile(), { force: true });
        } catch (e) {
            log.warn(`applock @ persist: ${e.message}`);
        }
    }

    restore() {
        try {
            const saved = JSON.parse(fs.readFileSync(this.stateFile(), 'utf8'));
            if (saved?.policy?.active && saved.policy.until && Date.now() < saved.policy.until + NO_CONTACT_GRACE_MS) {
                this.policy = saved.policy;
                this.owner = saved.owner;
                this.state = 'active';   // no new warning: the student already had it
                log.info(`applock: resumed after app restart (until ${new Date(saved.policy.until).toLocaleTimeString()})`);
            } else {
                fs.rmSync(this.stateFile(), { force: true });
            }
        } catch {
            // no saved lock
        }
    }

    stop() {
        clearInterval(this.timer);
        this.timer = null;
        stopWatchers();
    }

    /**
     * New policy from the teacher (called with every heartbeat). owner = "session@teacherIp".
     * A session that did not set the lock (e.g. one a student started himself) cannot lift it.
     */
    setPolicy(policy, owner = null) {
        const next = policy && policy.active ? policy : { active: false };
        const wasActive = this.policy.active;
        if (!next.active && wasActive && this.owner && owner !== this.owner) return;
        const changed = next.active !== wasActive || (next.active && next.policyId !== this.policy.policyId);
        this.policy = next;
        if (next.active) this.owner = owner;
        if (!changed) return;
        this.persist();

        if (next.active) {
            const grace = Math.max(0, Number(next.graceSeconds ?? 30));
            this.graceUntil = Date.now() + grace * 1000;
            this.state = grace > 0 ? 'grace' : 'active';
            log.info(`applock: activated (${next.mode}, ${next.allowed?.length || 0} programs allowed, warning ${grace}s)`);
        } else {
            this.state = 'off';
            this.pendingClose.clear();
            log.info('applock: lifted');
        }
        this.onStateChange?.(this.state);
    }

    /** Teacher removed the student or ended the session (only the session that set the lock counts). */
    lift(reason, owner = null) {
        if (!this.policy.active) return;
        if (this.owner && owner && owner !== this.owner) return;
        log.info(`applock: lifted (${reason})`);
        this.owner = null;
        this.setPolicy({ active: false });
        this.persist();
    }

    status() {
        return {
            state: this.state,
            mode: this.policy.active ? this.policy.mode : null,
            graceRemaining: this.state === 'grace' ? Math.max(0, Math.ceil((this.graceUntil - Date.now()) / 1000)) : 0,
            allowedLabels: this.policy.active ? (this.policy.allowed || []).map((e) => e.label) : [],
            until: this.policy.active ? this.policy.until || null : null,
            violations: this.violations.slice(0, MAX_VIOLATIONS),
            reportOnly: this.reportOnly,
            supported: allowlistSupported(),
            runningApps: this.runningApps,
        };
    }

    async list() {
        return this.fakeApps ? this.fakeApps.filter((a) => !a.closed) : listRunningApps();
    }

    async close(proc, force) {
        if (this.fakeApps) { proc.closed = true; return true; }
        return closeApp(proc, { force });
    }

    record(proc, action) {
        const key = proc.bundleId || proc.exe || proc.name;
        const now = Date.now();
        if (action === 'reported' && now - (this.lastReport.get(key) || 0) < REPORT_REPEAT_MS) return;
        this.lastReport.set(key, now);
        this.violations.unshift({ name: proc.appName || proc.title || proc.name, action, at: now });
        this.violations.length = Math.min(this.violations.length, MAX_VIOLATIONS);
        log.warn(`applock: ${action} "${proc.appName || proc.name}" (${key})`);
    }

    async tick() {
        if (this.busy) return;
        this.busy = true;
        try {
            const now = Date.now();
            if (!this.connected && this.state === 'off') {
                if (this.runningApps.length) { this.runningApps = []; stopWatchers(); }
                return;
            }
            const needList = this.state !== 'off' || now - this.runningAppsAt > RUNNING_APPS_REFRESH_MS;
            if (!needList) return;
            const apps = await this.list();

            // windowed programs for the teacher's "aus laufenden Programmen übernehmen"
            if (now - this.runningAppsAt > RUNNING_APPS_REFRESH_MS) {
                const seen = new Set();
                this.runningApps = apps.filter((a) => a.windowed)
                    .filter((a) => { const k = a.bundleId || a.exe || a.name; if (seen.has(k)) return false; seen.add(k); return true; })
                    .slice(0, 40)
                    .map(({ name, exe, bundleId, appName, title }) => ({ name, exe: exe ? String(exe).split(/[\\/]/).pop() : undefined, bundleId, appName, title }));
                this.runningAppsAt = now;
            }

            // end time reached without the teacher lifting it (e.g. no contact): end + 5 min
            if (this.policy.active && this.policy.until && now > this.policy.until + NO_CONTACT_GRACE_MS) {
                this.lift('expired');
                return;
            }
            if (this.state === 'grace' && now >= this.graceUntil) {
                this.state = 'active';
                this.onStateChange?.(this.state);
            }
            if (this.state !== 'active') return;

            const allowed = this.policy.allowed || [];
            const ownPid = process.pid;
            for (const proc of apps) {
                if (proc.pid === ownPid) continue;
                if (classify(proc, allowed, process.platform) !== 'blocked') continue;

                if (this.policy.mode !== 'kill' || this.reportOnly) {
                    this.record(proc, 'reported');
                    continue;
                }
                const firstTry = this.pendingClose.get(proc.pid);
                if (!firstTry) {
                    this.pendingClose.set(proc.pid, now);
                    await this.close(proc, false);
                    this.record(proc, 'closed');
                } else if (now - firstTry > FORCE_AFTER_MS) {
                    await this.close(proc, true);
                    this.pendingClose.delete(proc.pid);
                    this.record(proc, 'killed');
                }
            }
            // forget pids that are gone
            const alive = new Set(apps.map((a) => a.pid));
            for (const pid of this.pendingClose.keys()) if (!alive.has(pid)) this.pendingClose.delete(pid);
        } catch (e) {
            log.warn(`applock @ tick: ${e.message}`);
        } finally {
            this.busy = false;
        }
    }
}

export default new AppLock();
