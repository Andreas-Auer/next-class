/**
 * @license GPL LICENSE
 * Copyright (c) 2021 Thomas Michael Weissel (Next-Exam)
 * Modifications for Next-Class (c) 2026 Andreas Auer
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

import net from 'net';
import os, { networkInterfaces } from 'os';
import tls from 'node:tls';
import { createHash } from 'node:crypto';
import ip from 'ip';
import { ipcMain, app } from 'electron';
import log from 'electron-log';
import i18n from '../../../src/locales/locales.js';
import { gateway4sync } from '../../../../shared/defaultGateway.js';
import { normalizeStudentClientName } from '../../../../shared/normalizeStudentClientName.js';
import { encryptSessionPayload } from '../../../../shared/apiSecret.js';
import { updateSystemTray } from './traymenu.js';
import { syncClientDisplayInfo } from './displayInfo.js';
import { examApiFetch } from './examApiFetch.js';
import AppLock from './applock/appLock.js';
import NetLock from './netlock/netLock.js';

/** IPC between the student renderer and the main process. */
class IpcHandler {
    constructor() {
        this.multicastClient = null;
        this.config = null;
        this.WindowHandler = null;
        this.CommHandler = null;
        this.preferredInterface = null;
        this.availableInterfaces = [];
    }

    /** Only the main window may trigger network actions. */
    fromMainWindow(event) {
        return event.sender === this.WindowHandler.mainwindow?.webContents;
    }

    /** Read the teacher leaf certificate fingerprint without sending API credentials. */
    readTeacherCertificateFingerprint(serverip) {
        return new Promise((resolve) => {
            const socket = tls.connect({
                host: serverip,
                port: this.config.serverApiPort,
                rejectUnauthorized: false,
                ...(net.isIP(serverip) ? {} : { servername: serverip }),
            }, () => {
                const raw = socket.getPeerCertificate()?.raw;
                socket.end();
                if (!raw) return resolve(null);
                const pem = `-----BEGIN CERTIFICATE-----\n${raw.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`;
                this.multicastClient.setTeacherCertificatePem(serverip, pem);
                resolve(createHash('sha256').update(raw).digest('hex'));
            });
            socket.setTimeout(4000, () => { socket.destroy(); resolve(null); });
            socket.once('error', () => resolve(null));
        });
    }

    /** Read the teacher certificate and apply trust-on-first-use pinning. */
    async probeTeacherCertificate(serverip) {
        const fingerprint = await this.readTeacherCertificateFingerprint(serverip);
        if (!fingerprint) return { status: 'error', code: 'UNREACHABLE' };
        return this.multicastClient.observeTeacherCertificate(serverip, fingerprint);
    }

    /** Pick the network interface used for discovery and as our own address. */
    async checkHostIp() {
        const interfaces = networkInterfaces();
        this.availableInterfaces = [];
        for (const [name, addrs] of Object.entries(interfaces)) {
            if (name.startsWith('br') || name.startsWith('vpn')) continue;   // bridges and VPNs are never the classroom LAN
            for (const iface of addrs || []) {
                if (iface.family === 'IPv4' && !iface.address.startsWith('127.') && !iface.address.startsWith('169.254.')) {
                    this.availableInterfaces.push({ name, address: iface.address });
                }
            }
        }

        const oldHostIp = this.config.hostip;
        const preferred = this.preferredInterface && this.availableInterfaces.find((i) => i.name === this.preferredInterface);
        if (preferred) {
            this.config.hostip = preferred.address;
            this.config.interface = preferred.name;
            try { this.config.gateway = gateway4sync(preferred.name).int === preferred.name; } catch { this.config.gateway = false; }
        } else {
            try {
                const { int } = gateway4sync();
                this.config.hostip = ip.address(int);
                this.config.interface = int;
                this.config.gateway = true;
            } catch {
                this.config.hostip = this.availableInterfaces[0]?.address || false;
                this.config.interface = this.availableInterfaces[0]?.name || false;
                this.config.gateway = false;
            }
        }
        if (this.config.hostip === '127.0.0.1') this.config.hostip = false;

        // (re)start discovery on the chosen interface
        let running = false;
        try { running = !!this.multicastClient?.client?.address?.(); } catch { /* not bound */ }
        if (this.config.hostip && (oldHostIp !== this.config.hostip || !running)) {
            try {
                if (running) await this.multicastClient.stop(oldHostIp);
                this.multicastClient.init(this.config.gateway);
                log.info(`ipchandler @ checkHostIp: discovery listening on ${this.config.interface} (${this.config.hostip})`);
            } catch (e) {
                log.error('ipchandler @ checkHostIp: could not start discovery', e);
            }
        }

        return {
            hostip: this.config.hostip,
            interface: this.config.interface,
            availableInterfaces: this.availableInterfaces,
            preferredInterface: this.preferredInterface,
        };
    }

    /**
     * Register at a teacher session. Used by the join button and by the automatic reconnect.
     * args: { clientname, servername, serverip, pin }
     */
    async register(args = {}) {
        const ci = this.multicastClient.clientinfo;
        if (ci.token) return { status: 'error', code: 'ALREADY_REGISTERED' };

        const clientname = normalizeStudentClientName(args.clientname);
        const { pin, serverip, servername } = args;
        if (!clientname || !pin || !serverip || !servername) return { status: 'error', code: 'MISSING_INPUT' };

        const certificate = await this.probeTeacherCertificate(serverip);
        if (certificate.status !== 'trusted') return { ...certificate, serverip };

        const clientip = this.config.hostip || ip.address();
        const hostname = os.hostname();
        const payload = {
            pin, clientname, clientip, hostname,
            version: this.config.version,
            reconnectToken: this.multicastClient.reconnectToken || undefined,
        };
        try {
            const packet = await encryptSessionPayload(payload, pin);
            const response = await examApiFetch(
                `https://${serverip}:${this.config.serverApiPort}/server/control/registerclient/${encodeURIComponent(servername)}`,
                { method: 'POST', signal: AbortSignal.timeout(8000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packet }) }
            );
            const data = await response.json();
            if (data?.status !== 'success') return { status: 'error', message: data?.message, code: data?.code };

            Object.assign(ci, { name: clientname, serverip, servername, ip: clientip, hostname, token: data.token, pin, reconnecting: false });
            this.multicastClient.reconnectToken = data.token;
            this.multicastClient.beaconsLost = 0;
            this.CommHandler.rememberSession({ clientname, servername, serverip, pin });
            log.info(`ipchandler @ register: ${data.reconnected ? 'reconnected to' : 'joined'} "${servername}" @ ${serverip} as ${clientname}`);
            return data;
        } catch (error) {
            return { status: 'error', code: error.name === 'TimeoutError' || error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK', detail: error.message };
        }
    }

    init(mc, config, wh, ch) {
        this.multicastClient = mc;
        this.config = config;
        this.WindowHandler = wh;
        this.CommHandler = ch;
        this.CommHandler.registerFn = (args) => this.register(args);   // used for the automatic reconnect

        ipcMain.on('getconfig', (event) => {
            event.returnValue = JSON.parse(JSON.stringify(this.config));
        });

        ipcMain.on('set-new-locale', (_event, locale) => {
            i18n.global.locale = locale;
            updateSystemTray(locale);
        });

        ipcMain.handle('quit-app', () => {
            if (this.WindowHandler.mainwindow) this.WindowHandler.mainwindow.allowexit = true;
            app.quit();
        });

        ipcMain.handle('checkhostip', () => this.checkHostIp());

        ipcMain.handle('setPreferredInterface', (_event, name) => {
            this.preferredInterface = name || null;
        });

        /** Sessions found on the network plus our own state (polled by the renderer). */
        ipcMain.handle('getinfoasync', () => {
            syncClientDisplayInfo(this.multicastClient.clientinfo);
            this.multicastClient.clientinfo.applock = AppLock.status();   // live state (e.g. warning countdown)
            this.multicastClient.clientinfo.netlock = NetLock.status();
            return {
                serverlist: this.multicastClient.examServerList,
                clientinfo: this.multicastClient.clientinfo,
            };
        });

        /** Is the teacher API reachable with a trusted certificate? */
        ipcMain.handle('pingexamserver', async (event, { serverip } = {}) => {
            if (!this.fromMainWindow(event) || !serverip) return { ok: false };
            try {
                const certificate = await this.probeTeacherCertificate(serverip);
                if (certificate.status !== 'trusted') return { ok: false, ...certificate };
                const response = await examApiFetch(`https://${serverip}:${this.config.serverApiPort}/server/control/pong`,
                    { method: 'GET', signal: AbortSignal.timeout(4000) });
                return { ok: response.ok };
            } catch {
                return { ok: false };
            }
        });

        /** Manual join by IP or host name (multicast blocked on the network). */
        ipcMain.handle('fetch-exam-server-list', async (event, { serverip } = {}) => {
            if (!this.fromMainWindow(event)) return { status: 'error' };
            if (!serverip || !(net.isIP(serverip) || /^[a-z0-9.-]+$/i.test(serverip))) return { status: 'error' };
            try {
                const certificate = await this.probeTeacherCertificate(serverip);
                if (certificate.status !== 'trusted') return certificate;
                const response = await examApiFetch(`https://${serverip}:${this.config.serverApiPort}/server/control/serverlist`,
                    { method: 'GET', signal: AbortSignal.timeout(4000) });
                const data = await response.json();
                for (const server of data?.serverlist || []) {
                    this.multicastClient.allowTeacherCertificateHost(server.serverip || serverip, server.tlsFingerprint);
                }
                return data;
            } catch (e) {
                return { status: 'error', message: e.message };
            }
        });

        /** Student confirmed a changed teacher certificate (teacher app was restarted). */
        ipcMain.handle('accept-teacher-certificate', async (event, { serverip } = {}) => {
            if (!this.fromMainWindow(event)) return { ok: false };
            const fingerprint = await this.readTeacherCertificateFingerprint(serverip);
            const ok = this.multicastClient.pinTeacherCertificate(serverip, fingerprint);
            if (ok) await this.multicastClient.onTeacherCertificateAccepted?.();
            return { ok };
        });

        /** Join a session: { clientname, servername, serverip, pin }. */
        ipcMain.handle('register', async (event, args = {}) => {
            if (!this.fromMainWindow(event)) return { status: 'error', code: 'INVALID_SOURCE' };
            return this.register(args);
        });

        // test hook: simulate a network dropout (only in e2e runs)
        if (process.env.NXE_E2E_SERVER_API_PORT) {
            ipcMain.handle('e2e-drop-connection', () => this.CommHandler.dropRegistration());
            ipcMain.handle('e2e-force-unchanged', (_e, seconds) => this.CommHandler.forceUnchanged(Number(seconds) || 0));
            ipcMain.handle('e2e-fake-apps', (_e, apps) => { AppLock.fakeApps = apps; AppLock.runningAppsAt = 0; });
        }

        /** Tell the teacher that the app is being closed (best effort, max 1.5 s). */
        this.notifyQuit = async () => {
            const ci = this.multicastClient.clientinfo;
            if (!ci.token || !ci.serverip) return;
            try {
                await examApiFetch(this.CommHandler.teacherUrl('leave'), {
                    method: 'POST',
                    headers: this.CommHandler.authHeaders(),
                    body: JSON.stringify({ clientinfo: { servername: ci.servername }, reason: 'quit' }),
                    signal: AbortSignal.timeout(1500),
                });
            } catch { /* teacher not reachable */ }
        };

        /** One-time installation of the helper for the internet lock (shows the system's admin prompt). */
        ipcMain.handle('netlock-install', (event) => (this.fromMainWindow(event) ? NetLock.install() : { status: 'error' }));

        /** Student leaves the session: tell the teacher (best effort), then forget the registration. */
        ipcMain.handle('disconnect', async () => {
            const ci = this.multicastClient.clientinfo;
            if (ci.token && ci.serverip) {
                try {
                    await examApiFetch(this.CommHandler.teacherUrl('leave'), {
                        method: 'POST',
                        headers: this.CommHandler.authHeaders(),
                        body: JSON.stringify({ clientinfo: { servername: ci.servername } }),
                        signal: AbortSignal.timeout(3000),
                    });
                } catch (e) {
                    log.warn(`ipchandler @ disconnect: could not notify teacher: ${e.message}`);
                }
            }
            log.info('ipchandler @ disconnect: student left the session');
            this.CommHandler.forgetSession();
            this.CommHandler.resetConnection();   // keeps the reconnect token: rejoining with the same name stays possible
            return { status: 'success' };
        });
    }
}

export default new IpcHandler();
