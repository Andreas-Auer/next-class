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
import { STUDENT_OFFLINE_AFTER_MS } from '../../server/src/routes/server/control.js';
import i18n from '../../../src/locales/locales.js';

const { t } = i18n.global;
const SESSION_NAME_PATTERN = /^[a-z0-9äöüß][a-z0-9äöüß _.-]{0,39}$/;
const DEFAULT_SCREENSHOT_INTERVAL_S = 4;

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
            session.serverstatus = { screenslocked: false, screenshotinterval: DEFAULT_SCREENSHOT_INTERVAL_S };
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
