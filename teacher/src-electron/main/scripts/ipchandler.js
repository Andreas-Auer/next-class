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

import { ipcMain } from 'electron';
import { networkInterfaces } from 'os';
import ip from 'ip';
import log from 'electron-log';
import { gateway4sync } from '../../../../shared/defaultGateway.js';
import MulticastServer from './multicastserver.js';
import { STUDENT_OFFLINE_AFTER_MS, addEvent } from '../../server/src/routes/server/control.js';
import i18n from '../../../src/locales/locales.js';
import crypto from 'crypto';
import AppLockStore from './applockStore.js';
import { resolveEntries, entryFromRunningApp } from '../../../../shared/appCatalog.js';

const { t } = i18n.global;
const SESSION_NAME_PATTERN = /^[a-z0-9äöüß][a-z0-9äöüß _.-]{0,39}$/;
const DEFAULT_SCREENSHOT_INTERVAL_S = 4;
const DEFAULT_IDLE_THRESHOLD_S = 120;
const MAX_LOCK_MS = 4 * 60 * 60 * 1000;   // a lock never lasts longer than 4 hours (decision 2026-11-06)   // show the "screen unchanged" counter after 2 minutes

/** IPC between the teacher renderer and the main process (session lifecycle, student list, commands). */
class IpcHandler {
    constructor() {
        this.multicastClient = null;
        this.config = null;
        this.WindowHandler = null;
        this.preferredInterface = null;
    }

    /** Plain copy of config for the renderer (session objects hold sockets and are not serializable). */
    copyConfig() {
        const { examServerList, ...rest } = this.config;
        return JSON.parse(JSON.stringify(rest));
    }

    session(servername) {
        return this.config.examServerList[servername] || null;
    }

    /** Student entry as shown in the dashboard (no tokens). */
    publicStudent(student, now) {
        return {
            clientname: student.clientname,
            hostname: student.hostname,
            clientip: student.clientip,
            version: student.version,
            online: now - student.timestamp <= STUDENT_OFFLINE_AFTER_MS,
            lastSeen: student.timestamp,
            joinedAt: student.joinedAt,
            screenlock: !!student.screenlock,
            imageurl: student.imageurl || false,
            imageTimestamp: student.imageTimestamp || 0,
            multiMonitor: !!student.multiMonitor,
            screenPermission: student.screenPermission || 'unknown',
            screenCaptureFailed: !!student.screenCaptureFailed,
            platform: student.platform || null,
            applock: student.applock || null,
            netlock: student.netlock || null,
            quitAt: student.quitAt || null,
            leftAt: student.leftAt || null,
            unchangedSince: student.unchangedSince ?? null,
        };
    }

    init(mc, config, wh) {
        this.multicastClient = mc;
        this.config = config;
        this.WindowHandler = wh;

        ipcMain.on('getconfig', (event) => { event.returnValue = this.copyConfig(); });
        ipcMain.handle('getconfigasync', () => this.copyConfig());

        /** Start a session: { servername } -> { status, servername, pin }. */
        ipcMain.handle('startExamServer', (_event, payload = {}) => {
            const servername = String(payload.servername || '').trim().toLowerCase();
            if (!SESSION_NAME_PATTERN.test(servername)) return { status: 'error', message: t('control.invalidname') };
            if (this.session(servername)) return { status: 'error', message: t('control.serverexists') };
            if (this.multicastClient.examServerList.some((s) => s.servername === servername)) {
                return { status: 'error', message: t('control.serverexistsLAN') };
            }

            const pin = this.config.development ? '1111' : String(Math.floor(Math.random() * 9000) + 1000);
            const session = new MulticastServer();
            session.init(servername, pin);
            session.serverstatus = { screenslocked: false, screenshotinterval: DEFAULT_SCREENSHOT_INTERVAL_S, idlethreshold: DEFAULT_IDLE_THRESHOLD_S };
            this.config.examServerList[servername] = session;
            log.info(`ipchandler @ startExamServer: session "${servername}" started`);
            return { status: 'success', servername, pin };
        });

        /** End a session; students drop their registration (and any screen lock) after the next missed heartbeats. */
        ipcMain.handle('stopserver', (_event, servername) => {
            const session = this.session(servername);
            if (!session) return false;
            session.broadcastInterval?.stop();
            try { session.server?.close(); } catch { /* already closed */ }
            delete this.config.examServerList[servername];
            this.multicastClient.examServerList = this.multicastClient.examServerList.filter((s) => s.servername !== servername);
            log.info(`ipchandler @ stopserver: session "${servername}" ended`);
            return true;
        });

        /** Sessions running on this teacher app. */
        ipcMain.handle('runningSessions', () => Object.keys(this.config.examServerList));

        /** Sessions of other teacher apps on the network (from their beacons). */
        ipcMain.handle('lanSessions', () => {
            const own = new Set(Object.values(this.config.examServerList).map((s) => s.serverinfo.id));
            return this.multicastClient.examServerList
                .filter((s) => !own.has(s.id))
                .map((s) => ({ id: s.id, servername: s.servername, serverip: s.serverip }));
        });

        ipcMain.handle('sessionEvents', (_event, servername) => this.session(servername)?.events || []);

        ipcMain.handle('getSessionInfo', (_event, servername) => {
            const session = this.session(servername);
            if (!session) return { status: 'error' };
            return {
                status: 'success',
                servername,
                pin: session.serverinfo.pin,
                serverip: session.serverinfo.ip,
                serverstatus: session.serverstatus,
            };
        });

        ipcMain.handle('studentlist', (_event, servername) => {
            const session = this.session(servername);
            if (!session) return { status: 'error', studentlist: [] };
            const now = Date.now();
            // connection lost / back: detected here because the dashboard polls every 2 s
            for (const s of session.studentList) {
                const online = now - s.timestamp <= STUDENT_OFFLINE_AFTER_MS;
                if (s.wasOnline && !online && !s.quitAt && !s.leftAt) addEvent(session, s.clientname, 'offline');
                if (s.wasOnline === false && online) addEvent(session, s.clientname, 'online');
                s.wasOnline = online;
            }
            return { status: 'success', studentlist: session.studentList.map((s) => this.publicStudent(s, now)) };
        });

        /** Change session settings: { servername, screenslocked?, screenshotinterval? } */
        ipcMain.handle('setServerStatus', (_event, payload = {}) => {
            const session = this.session(payload.servername);
            if (!session) return { status: 'error', message: t('control.notfound') };
            if (typeof payload.screenslocked === 'boolean') session.serverstatus.screenslocked = payload.screenslocked;
            if (Number.isFinite(payload.screenshotinterval) && payload.screenshotinterval >= 0) {
                session.serverstatus.screenshotinterval = payload.screenshotinterval;
            }
            if (Number.isFinite(payload.idlethreshold) && payload.idlethreshold >= 0) {
                session.serverstatus.idlethreshold = payload.idlethreshold;   // 0 = inactivity display off
            }
            log.info(`ipchandler @ setServerStatus: ${payload.servername} -> ${JSON.stringify(session.serverstatus)}`);
            return { status: 'success', serverstatus: session.serverstatus };
        });

        /** Remove a student: online students get "kicked" with the next heartbeat, offline ones are dropped at once. */
        ipcMain.handle('kickStudent', (_event, { servername, clientname } = {}) => {
            const session = this.session(servername);
            const student = session?.studentList.find((s) => s.clientname === clientname);
            if (!student) return { status: 'error' };
            if (Date.now() - student.timestamp <= STUDENT_OFFLINE_AFTER_MS) {
                student.status.kicked = true;
            } else {
                session.studentList = session.studentList.filter((s) => s !== student);
            }
            return { status: 'success' };
        });

        // ---- program lock ------------------------------------------------------
        ipcMain.handle('applock-overview', () => AppLockStore.overview());
        ipcMain.handle('applock-save-template', (_e, tpl) => AppLockStore.saveTemplate(tpl || {}));
        ipcMain.handle('applock-delete-template', (_e, id) => AppLockStore.deleteTemplate(id));
        ipcMain.handle('applock-delete-custom', (_e, id) => AppLockStore.deleteCustomEntry(id));
        ipcMain.handle('netlock-save-exceptions', (_e, list) => AppLockStore.saveNetExceptions(list));

        /** Take over a program from a student's list of running programs as a custom entry. */
        ipcMain.handle('applock-add-running', (_e, { app, platform } = {}) => {
            if (!app || !platform) return { status: 'error' };
            return AppLockStore.addCustomEntry(entryFromRunningApp(app, platform));
        });

        /**
         * Start, change or lift the program lock of a session:
         * { servername, active, mode: 'kill'|'report', allowedIds: [...], templateName, graceSeconds }
         */
        ipcMain.handle('setAppLock', (_e, payload = {}) => {
            const session = this.session(payload.servername);
            if (!session) return { status: 'error', message: t('control.notfound') };
            if (!payload.active) {
                session.serverstatus.applock = { active: false };
                log.info(`ipchandler @ setAppLock: ${payload.servername} -> lifted`);
                return { status: 'success', applock: session.serverstatus.applock };
            }
            const now = Date.now();
            const until = Math.min(Number(payload.until) || 0, now + MAX_LOCK_MS);
            if (until <= now + 60_000) return { status: 'error', message: t('netlock.endinpast') };
            const allowedIds = [...new Set(payload.allowedIds || [])];
            session.serverstatus.applock = {
                active: true,
                policyId: crypto.randomUUID(),   // a new id restarts the warning period on the students
                mode: payload.mode === 'report' ? 'report' : 'kill',
                graceSeconds: Number.isFinite(payload.graceSeconds) ? payload.graceSeconds : Number(process.env.NEXT_CLASS_APPLOCK_GRACE ?? 30),
                templateName: String(payload.templateName || ''),
                allowedIds,
                allowed: resolveEntries(allowedIds, AppLockStore.load().customEntries),
                startedAt: now,
                until,
            };
            log.info(`ipchandler @ setAppLock: ${payload.servername} -> ${session.serverstatus.applock.mode}, ${allowedIds.length} programs allowed`);
            return { status: 'success', applock: session.serverstatus.applock };
        });

        // ---- internet lock ---------------------------------------------------------
        /**
         * { servername, active, until (unix ms) }. The student devices keep the lock until "until"
         * even without contact to this app; ending the session or removing a student lifts it earlier.
         */
        ipcMain.handle('setNetLock', (_e, payload = {}) => {
            const session = this.session(payload.servername);
            if (!session) return { status: 'error', message: t('control.notfound') };
            if (!payload.active) {
                session.serverstatus.netlock = { active: false };
                log.info(`ipchandler @ setNetLock: ${payload.servername} -> lifted`);
                return { status: 'success', netlock: session.serverstatus.netlock };
            }
            const now = Date.now();
            const until = Math.min(Number(payload.until) || 0, now + MAX_LOCK_MS);
            if (until <= now + 60_000) return { status: 'error', message: t('netlock.endinpast') };
            session.serverstatus.netlock = {
                active: true,
                policyId: crypto.randomUUID(),
                until,
                startedAt: now,
                extraAllow: Array.isArray(payload.extraAllow) ? payload.extraAllow.slice(0, 50) : [],
            };
            log.info(`ipchandler @ setNetLock: ${payload.servername} -> until ${new Date(until).toLocaleTimeString()}`);
            return { status: 'success', netlock: session.serverstatus.netlock };
        });

        ipcMain.handle('checkhostip', () => this.checkHostIp());
        ipcMain.handle('setPreferredInterface', (_event, name) => { this.preferredInterface = name || null; });
    }

    /** Pick the classroom network interface (the one with the default gateway unless the teacher chose another). */
    async checkHostIp() {
        const availableInterfaces = [];
        for (const [name, addrs] of Object.entries(networkInterfaces())) {
            if (name.startsWith('br') || name.startsWith('vpn')) continue;
            for (const iface of addrs || []) {
                if (iface.family === 'IPv4' && !iface.address.startsWith('127.') && !iface.address.startsWith('169.254.')) {
                    availableInterfaces.push({ name, address: iface.address });
                }
            }
        }

        const oldHostIp = this.config.hostip;
        const preferred = this.preferredInterface && availableInterfaces.find((i) => i.name === this.preferredInterface);
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
                this.config.hostip = availableInterfaces[0]?.address || false;
                this.config.interface = availableInterfaces[0]?.name || false;
                this.config.gateway = false;
            }
        }
        if (this.config.hostip === '127.0.0.1') this.config.hostip = false;

        if (this.config.hostip && oldHostIp !== this.config.hostip) {
            log.info(`ipchandler @ checkHostIp: IP changed from ${oldHostIp} to ${this.config.hostip}`);
            for (const session of Object.values(this.config.examServerList)) session.serverinfo.ip = this.config.hostip;
            try {
                if (this.multicastClient?.client) await this.multicastClient.stop?.();
                this.multicastClient.init(this.config.gateway);
            } catch (e) {
                log.error('ipchandler @ checkHostIp: could not restart discovery', e);
            }
        }

        return {
            hostip: this.config.hostip,
            interface: this.config.interface,
            availableInterfaces,
            preferredInterface: this.preferredInterface,
        };
    }
}

export default new IpcHandler();
