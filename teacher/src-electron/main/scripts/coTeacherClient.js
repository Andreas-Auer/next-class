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

class CoTeacherClient {
    constructor() {
        this.pins = new Map();   // "ip:port" -> sha256 fingerprint (hex, lower case)
        this.remote = null;      // { host, port, servername, token, name }
        this.config = null;
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

    init(config) {
        this.config = config;

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
                const packet = await encryptSessionPayload({ code: String(code || '').trim(), name }, String(code || '').trim());
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
                const data = await this.request(this.remote, '/server/teacher/rpc', {
                    token: this.remote.token,
                    body: { servername: this.remote.servername, method, args },
                });
                return data;
            } catch (e) {
                return { status: 'error', code: 'UNREACHABLE', message: e.message };
            }
        });

        ipcMain.handle('remote-info', () => (this.remote ? { servername: this.remote.servername, host: this.remote.host, port: this.remote.port, name: this.remote.name } : null));
        ipcMain.handle('remote-leave', () => { this.remote = null; return { status: 'success' }; });
    }
}

export default new CoTeacherClient();
