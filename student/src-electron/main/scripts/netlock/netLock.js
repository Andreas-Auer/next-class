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
 * Internet lock on the student device: turns the teacher's policy
 * { active, until, extraAllow, policyId } into a request for the helper.
 *
 * Reachable during the lock: the subnet of the network interface that connects to the teacher
 * (school WLAN, network drives), the teacher, extra networks from the teacher, DNS servers (port 53).
 *
 * The lock lives in the helper, not in this app: it stays until the end time even when the
 * connection to the teacher breaks or this app is closed. Lifted by the teacher, at the end
 * time, when the teacher ends the session or removes the student, and after a reboot.
 */

import os from 'os';
import dns from 'dns';
import net from 'net';
import log from 'electron-log';
import { helperLock, helperUnlock, helperStatus, isInstalled, installHelper } from './helperClient.js';
import { resolveExceptions } from './netExceptions.js';

const STATUS_REFRESH_MS = 5000;
const NO_CONTACT_GRACE_MS = 5 * 60 * 1000;   // without contact to the teacher the lock lasts until end time + 5 min
export class NetLock {
    constructor() {
        this.policy = { active: false };
        this.state = 'off';          // off | active | notinstalled | unreachable | error | installing
        this.error = '';
        this.events = [];
        this.helperVersion = null;
        this.installed = isInstalled();
        this.lastSync = 0;
        this.busy = false;
        this.owner = null;           // "session@teacherIp" that set the lock - only it may lift the lock early
    }

    /** Networks that stay reachable: own subnet (from the interface with hostip) + teacher + extras. */
    static allowedNetworks(hostip, teacherIp, extra = []) {
        const allow = new Set();
        for (const addrs of Object.values(os.networkInterfaces())) {
            for (const a of addrs || []) {
                if (a.family === 'IPv4' && a.address === hostip && a.cidr) allow.add(a.cidr);
            }
        }
        if (net.isIPv4(teacherIp || '')) allow.add(`${teacherIp}/32`);
        for (const e of extra || []) if (typeof e === 'string' && e.trim()) allow.add(e.trim());
        return [...allow];
    }

    static dnsServers() {
        // entries look like "192.168.1.1", "8.8.8.8:53" or "[2001:db8::1]:53"; only IPv4 is used
        return dns.getServers().map((s) => s.replace(/:\d+$/, '')).filter((s) => net.isIPv4(s));
    }

    /**
     * Called with every heartbeat. ctx: { hostip, teacherIp, servername }.
     * Re-sends the lock each time (idempotent in the helper) so a restarted helper is locked again at once.
     */
    async sync(policy, ctx) {
        if (this.busy) return;
        this.busy = true;
        try {
            const next = policy?.active ? policy : { active: false };
            const owner = `${ctx.servername}@${ctx.teacherIp}`;
            const wasActive = this.policy.active;
            this.installed = isInstalled();

            // another session (e.g. one a student started himself) must not lift a running lock
            if (!next.active && wasActive && this.owner && this.owner !== owner) return;
            this.policy = next;
            if (next.active) this.owner = owner;

            if (next.active) {
                if (!this.installed) { this.state = 'notinstalled'; return; }
                const req = {
                    until: next.until + NO_CONTACT_GRACE_MS,   // with contact the teacher lifts it exactly at the end time
                    allow: NetLock.allowedNetworks(ctx.hostip, ctx.teacherIp, await resolveExceptions(next.extraAllow)),
                    dns: NetLock.dnsServers(),
                    sessionId: next.policyId,
                };
                const st = await helperLock(req);
                this.applyStatus(st);
                this.state = st.locked ? 'active' : 'error';
                if (!wasActive) log.info(`netlock: active until ${new Date(next.until).toLocaleTimeString()} (allowed ${req.allow.join(', ')})`);
            } else if (wasActive) {
                await this.lift('teacher', owner);
            } else if (Date.now() - this.lastSync > STATUS_REFRESH_MS && this.installed) {
                this.applyStatus(await helperStatus());   // keep version / events fresh while idle
                this.state = 'off';
            } else if (!this.installed) {
                this.state = 'off';
            }
            this.error = '';
        } catch (e) {
            this.state = e.code === 'NOT_INSTALLED' ? 'notinstalled' : e.code === 'UNREACHABLE' ? 'unreachable' : 'error';
            this.error = e.message;
            log.warn(`netlock @ sync: ${e.message}`);
        } finally {
            this.lastSync = Date.now();
            this.busy = false;
        }
    }

    applyStatus(st) {
        this.helperVersion = st.version || this.helperVersion;
        this.events = (st.events || []).slice(0, 10);
    }

    /** Teacher lifted the lock, ended the session or removed the student (owner: session@teacherIp). */
    async lift(reason, owner) {
        if (this.owner && owner && owner !== this.owner) return;   // not the session that set the lock
        this.policy = { active: false };
        this.owner = null;
        this.state = 'off';
        if (!isInstalled()) return;
        try {
            this.applyStatus(await helperUnlock(reason));
            log.info(`netlock: lifted (${reason})`);
        } catch (e) {
            log.warn(`netlock @ lift: ${e.message}`);
        }
    }

    /** One-time installation with the system's admin prompt (started by the student). */
    async install() {
        this.state = 'installing';
        try {
            await installHelper();
            this.installed = true;
            this.state = this.policy.active ? 'notinstalled' : 'off';   // next sync applies an active lock
            return { status: 'success' };
        } catch (e) {
            this.state = 'error';
            this.error = e.message;
            log.error(`netlock @ install: ${e.message}`);
            return { status: 'error', message: e.message };
        }
    }

    status() {
        return {
            state: this.state,
            installed: this.installed,
            until: this.policy.active ? this.policy.until : null,
            events: this.events,
            helperVersion: this.helperVersion,
            error: this.error || undefined,
        };
    }
}

export default new NetLock();
