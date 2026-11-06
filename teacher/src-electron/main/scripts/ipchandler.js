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
import { sessionOps } from './sessionOps.js';
import { resolveEntries, entryFromRunningApp } from '../../../../shared/appCatalog.js';

const { t } = i18n.global;

/** Accept only well-formed custom program entries sent by a co-teacher. */
function validCustomEntries(list) {
    const strings = (v) => Array.isArray(v) && v.length <= 10 && v.every((x) => typeof x === 'string' && x.length < 200);
    return (Array.isArray(list) ? list : []).slice(0, 100).filter((e) => e && typeof e.id === 'string' && e.id.startsWith('custom-')
        && typeof e.label === 'string' && e.label.length < 100
        && (!e.win || strings(e.win.exe)) && (!e.mac || ((!e.mac.bundleId || strings(e.mac.bundleId)) && (!e.mac.app || strings(e.mac.app))))
        && (!e.linux || strings(e.linux.proc)))
        .map((e) => ({ id: e.id, label: e.label, custom: true, win: e.win, mac: e.mac, linux: e.linux }));
}
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

    /** Register a session operation for the local dashboard (IPC) and for co-teachers (RPC). */
    op(name, fn) {
        sessionOps[name] = (payload) => fn(null, payload);
        ipcMain.handle(name, fn);
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
            session.teacherCode = this.config.development ? '222222' : String(crypto.randomInt(100000, 1000000));
            session.coTeachers = [];          // { name, token, ip, joinedAt, lastSeen }
            session.pendingJoins = new Map(); // requestId -> { name, ip, at, status: pending|approved|denied, token? }
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

        this.op('sessionEvents', (_event, servername) => this.session(servername)?.events || []);

        this.op('getSessionInfo', (_event, servername) => {
            const session = this.session(servername);
            if (!session) return { status: 'error' };
            return {
                status: 'success',
                servername,
                teacherCode: session.teacherCode,
                pin: session.serverinfo.pin,
                serverip: session.serverinfo.ip,
                serverstatus: session.serverstatus,
            };
        });

        this.op('studentlist', (_event, servername) => {
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
        this.op('setServerStatus', (_event, payload = {}) => {
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
        this.op('kickStudent', (_event, { servername, clientname } = {}) => {
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
        this.op('setAppLock', (_e, payload = {}) => {
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
                // own programs of a co-teacher are not stored on this device: they are sent along
                allowed: resolveEntries(allowedIds, [...AppLockStore.load().customEntries, ...validCustomEntries(payload.customEntries)]),
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
        this.op('setNetLock', (_e, payload = {}) => {
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

        // ---- co-teachers -------------------------------------------------------------
        /** All teachers of a session (host first). Co-teachers count as connected for 15 s after their last call. */
        this.op('teacherList', (_e, servername) => {
            const session = this.session(servername);
            if (!session) return [];
            const now = Date.now();
            return [
                { name: t('coteacher.host'), host: true, online: true },
                ...(session.coTeachers || []).map((c) => ({ name: c.name, ip: c.ip, joinedAt: c.joinedAt, online: now - c.lastSeen < 15000 })),
            ];
        });

        // ---- failover ------------------------------------------------------------------
        /** Everything a co-teacher needs to continue the session if this host fails (co-teachers only). */
        this.op('replicaState', (_e, servername) => {
            const session = this.session(servername);
            if (!session) return null;
            return {
                servername,
                id: session.serverinfo.id,
                epoch: session.serverinfo.epoch || 0,
                pin: session.serverinfo.pin,
                teacherCode: session.teacherCode,
                serverstatus: session.serverstatus,
                studentList: session.studentList.map((st) => ({
                    clientname: st.clientname, hostname: st.hostname, clientip: st.clientip, token: st.token, version: st.version, joinedAt: st.joinedAt,
                })),
                coTeachers: (session.coTeachers || []).map(({ name, ip, apiPort, token, joinedAt }) => ({ name, ip, apiPort, token, joinedAt })),
                events: (session.events || []).slice(0, 100),
            };
        });

        /** Join requests waiting for the host's decision (host only, not callable by co-teachers). */
        ipcMain.handle('pendingTeacherJoins', (_e, servername) => {
            const session = this.session(servername);
            if (!session) return [];
            return [...session.pendingJoins.entries()].filter(([, r]) => r.status === 'pending')
                .map(([requestId, r]) => ({ requestId, name: r.name, ip: r.ip, at: r.at }));
        });

        ipcMain.handle('decideTeacherJoin', (_e, { servername, requestId, approve } = {}) => {
            const session = this.session(servername);
            const req = session?.pendingJoins.get(requestId);
            if (!req || req.status !== 'pending') return { status: 'error' };
            if (approve) {
                req.status = 'approved';
                req.token = `teacher-${crypto.randomUUID()}`;
                session.coTeachers.push({ name: req.name, ip: req.ip, apiPort: req.apiPort, token: req.token, joinedAt: Date.now(), lastSeen: Date.now() });
                addEvent(session, req.name, 'teacher-joined');
            } else {
                req.status = 'denied';
            }
            log.info(`ipchandler @ decideTeacherJoin: ${req.name} ${req.status}`);
            return { status: 'success' };
        });

        ipcMain.handle('removeCoTeacher', (_e, { servername, name } = {}) => {
            const session = this.session(servername);
            if (!session) return { status: 'error' };
            session.coTeachers = session.coTeachers.filter((c) => c.name !== name);
            return { status: 'success' };
        });

        ipcMain.handle('checkhostip', () => this.checkHostIp());
        setInterval(() => this.checkSupersededSessions(), 5000);
        ipcMain.handle('setPreferredInterface', (_event, name) => { this.preferredInterface = name || null; });
    }

    /**
     * Failover: continue a session from a co-teacher's replica on this teacher app.
     * Same session id and PIN (students reconnect with their old tokens), epoch + 1.
     */
    importSession(replica, ownToken) {
        if (!replica?.servername || this.session(replica.servername)) return false;
        const session = new MulticastServer();
        session.init(replica.servername, replica.pin, { id: replica.id, epoch: (replica.epoch || 0) + 1 });
        session.teacherCode = replica.teacherCode;
        session.serverstatus = replica.serverstatus || {};
        session.studentList = (replica.studentList || []).map((st) => ({ ...st, timestamp: 0, imageurl: false, screenlock: false, status: {} }));
        const now = Date.now();
        session.coTeachers = (replica.coTeachers || []).filter((c) => c.token !== ownToken).map((c) => ({ ...c, lastSeen: now }));
        session.pendingJoins = new Map();
        session.events = replica.events || [];
        this.config.examServerList[replica.servername] = session;
        addEvent(session, t('coteacher.you'), 'host-failover');
        log.warn(`ipchandler @ importSession: took over "${replica.servername}" (epoch ${session.serverinfo.epoch})`);
        return true;
    }

    /** A session of this app is led by another teacher app with a higher epoch (we were offline): step down. */
    checkSupersededSessions() {
        for (const [servername, session] of Object.entries(this.config.examServerList)) {
            const newer = this.multicastClient.examServerList.find((b) => b.id === session.serverinfo.id && (b.epoch || 0) > (session.serverinfo.epoch || 0));
            if (!newer) continue;
            log.warn(`ipchandler @ checkSupersededSessions: "${servername}" is now led by ${newer.serverip} - stepping down`);
            session.broadcastInterval?.stop();
            try { session.server?.close(); } catch { /* closed */ }
            delete this.config.examServerList[servername];
            this.WindowHandler?.mainwindow?.webContents.send('session-taken-over', { servername, by: newer.serverip });
        }
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
