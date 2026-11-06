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
 * Co-teacher side: talks to the host teacher app over HTTPS.
 * The host's self-signed certificate is pinned on first contact (fingerprint), like the students do.
 */

import https from 'https';
import { ipcMain } from 'electron';
import log from 'electron-log';
import { buildAppSecretHeaders, encryptSessionPayload } from '../../../../shared/apiSecret.js';

const REPLICA_REFRESH_MS = 5000;     // copy of the session state kept by every co-teacher
const FAILOVER_AFTER_MS = 20000;     // host unreachable this long -> the first co-teacher takes over
const FAILOVER_STAGGER_MS = 15000;   // each further co-teacher waits longer (only one takes over)

class CoTeacherClient {
    constructor() {
        this.pins = new Map();   // "ip:port" -> sha256 fingerprint (hex, lower case)
        this.remote = null;      // { host, port, servername, token, name }
        this.config = null;
        this.replica = null;     // last copy of the host's session state
        this.lastOk = 0;         // last successful contact with the host
        this.hooks = {};         // { importSession(replica, token), notify(channel, data) }
        this.failoverBusy = false;
    }

    /** Remember a successful contact with the host. */
    ok(data) {
        if (data && data.status !== 'error') this.lastOk = Date.now();
        return data;
    }

    async refreshReplica() {
        if (!this.remote) return;
        try {
            const r = this.ok(await this.request(this.remote, '/server/teacher/rpc', {
                token: this.remote.token, body: { servername: this.remote.servername, method: 'replicaState' },
            }));
            if (r?.status === 'success' && r.result) this.replica = r.result;
        } catch { /* host unreachable - handled by the failover check */ }
    }

    /**
     * Host unreachable: co-teachers are ranked by join time. Each first looks whether a co-teacher
     * ranked before it already leads the session (rejoin with the same token); the first one takes over.
     */
    async checkFailover() {
        if (!this.remote || !this.replica || this.failoverBusy) return;
        const down = Date.now() - this.lastOk;
        if (down < FAILOVER_AFTER_MS) return;
        this.failoverBusy = true;
        try {
            const ranked = [...(this.replica.coTeachers || [])].sort((a, b) => a.joinedAt - b.joinedAt);
            const myIndex = ranked.findIndex((c) => c.token === this.remote.token);
            for (const candidate of ranked.slice(0, Math.max(0, myIndex))) {
                if (!candidate.ip) continue;
                const target = { host: candidate.ip, port: candidate.apiPort || this.config.serverApiPort };
                try {
                    const r = await this.request(target, '/server/teacher/rejoin', { token: this.remote.token, body: { servername: this.remote.servername } });
                    if (r?.status === 'success') {
                        this.remote = { ...this.remote, ...target };
                        this.lastOk = Date.now();
                        log.warn(`coTeacher: host failed, now connected to the new host ${target.host}:${target.port}`);
                        this.hooks.notify?.('coteacher-newhost', { host: target.host, name: candidate.name });
                        return;
                    }
                } catch { /* candidate not reachable or not leading */ }
            }
            if (myIndex >= 0 && down >= FAILOVER_AFTER_MS + myIndex * FAILOVER_STAGGER_MS) {
                const replica = this.replica;
                const token = this.remote.token;
                if (this.hooks.importSession?.(replica, token)) {
                    log.warn(`coTeacher: host unreachable for ${Math.round(down / 1000)} s - taking over "${replica.servername}"`);
                    this.remote = null;
                    this.replica = null;
                    this.hooks.notify?.('coteacher-became-host', { servername: replica.servername });
                }
            }
        } finally {
            this.failoverBusy = false;
        }
    }

    /** Parse "10.0.0.5" or "10.0.0.5:22522". */
    target(address) {
        const m = /^\s*([a-z0-9.-]+)(?::(\d+))?\s*$/i.exec(String(address || ''));
        if (!m) throw new Error('invalid address');
        return { host: m[1], port: Number(m[2] || this.config.serverApiPort) };
    }

    request({ host, port }, path, { method = 'POST', body, token } = {}) {
        return new Promise(async (resolve, reject) => {
            const data = body ? JSON.stringify(body) : undefined;
            const headers = { ...(await buildAppSecretHeaders()), 'Content-Type': 'application/json' };
            if (data) headers['Content-Length'] = Buffer.byteLength(data);
            if (token) headers.Authorization = `Bearer ${token}`;
            const key = `${host}:${port}`;
            const req = https.request({ host, port, path, method, headers, rejectUnauthorized: false, timeout: 8000, agent: false }, (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error(`invalid response (${res.statusCode})`)); }
                });
            });
            req.on('socket', (socket) => {
                socket.on('secureConnect', () => {
                    const fp = String(socket.getPeerCertificate()?.fingerprint256 || '').replace(/:/g, '').toLowerCase();
                    const pinned = this.pins.get(key);
                    if (!pinned) this.pins.set(key, fp);   // trust on first contact
                    else if (pinned !== fp) req.destroy(new Error('certificate of the host teacher app changed'));
                });
            });
            req.on('timeout', () => req.destroy(new Error('timeout')));
            req.on('error', reject);
            if (data) req.write(data);
            req.end();
        });
    }

    init(config, hooks = {}) {
        this.config = config;
        this.hooks = hooks;
        setInterval(() => this.refreshReplica(), REPLICA_REFRESH_MS);
        setInterval(() => this.checkFailover(), 3000);

        /** Sessions running on a teacher app given by address (manual join, multicast blocked). */
        ipcMain.handle('cojoin-list', async (_e, address) => {
            try {
                const t = this.target(address);
                const data = await this.request(t, '/server/control/serverlist', { method: 'GET' });
                return { status: 'success', serverlist: (data.serverlist || []).map((s) => ({ ...s, address: `${t.host}:${s.apiPort || t.port}` })) };
            } catch (e) {
                return { status: 'error', message: e.message };
            }
        });

        /** Ask the host to join: { address, servername, code, name } -> { requestId } */
        ipcMain.handle('cojoin-request', async (_e, { address, servername, code, name } = {}) => {
            try {
                const t = this.target(address);
                // apiPort: where this app can be reached if it has to take over the session
                const packet = await encryptSessionPayload({ code: String(code || '').trim(), name, apiPort: this.config.serverApiPort }, String(code || '').trim());
                const data = await this.request(t, `/server/teacher/join/${encodeURIComponent(servername)}`, { body: { packet } });
                return data;
            } catch (e) {
                return { status: 'error', message: e.message };
            }
        });

        /** Poll the host's decision; on approval this app becomes a co-teacher of that session. */
        ipcMain.handle('cojoin-status', async (_e, { address, servername, requestId, name } = {}) => {
            try {
                const t = this.target(address);
                const data = await this.request(t, '/server/teacher/joinstatus', { body: { servername, requestId } });
                if (data.status === 'approved') {
                    this.remote = { ...t, servername, token: data.token, name };
                    this.lastOk = Date.now();
                    this.refreshReplica();
                    log.info(`coTeacher: joined "${servername}" on ${t.host}:${t.port} as co-teacher`);
                }
                return data;
            } catch (e) {
                return { status: 'error', message: e.message };
            }
        });

        /** Dashboard calls of a co-teacher are forwarded to the host. */
        ipcMain.handle('remote-rpc', async (_e, { method, args } = {}) => {
            if (!this.remote) return { status: 'error', code: 'NOT_JOINED' };
            try {
                const data = this.ok(await this.request(this.remote, '/server/teacher/rpc', {
                    token: this.remote.token,
                    body: { servername: this.remote.servername, method, args },
                }));
                return data;
            } catch (e) {
                return { status: 'error', code: 'UNREACHABLE', message: e.message };
            }
        });

        ipcMain.handle('remote-info', () => (this.remote ? { servername: this.remote.servername, host: this.remote.host, port: this.remote.port, name: this.remote.name } : null));
        ipcMain.handle('remote-leave', () => { this.remote = null; this.replica = null; return { status: 'success' }; });
    }
}

export default new CoTeacherClient();
