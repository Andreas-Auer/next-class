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

import { desktopCapturer, screen, systemPreferences } from 'electron';
import log from 'electron-log';
import WindowHandler from './windowhandler.js';
import { SchedulerService } from './schedulerservice.ts';
import { syncClientDisplayInfo } from './displayInfo.js';
import { examApiFetch, isCertificateError } from './examApiFetch.js';
import { ScreenActivityTracker, SAMPLE_WIDTH, SAMPLE_HEIGHT, bgraToGray } from './screenActivity.js';
import AppLock from './applock/appLock.js';
import NetLock from './netlock/netLock.js';

const UPDATE_INTERVAL_MS = 5000;     // heartbeat to the teacher
const MAX_LOST_HEARTBEATS = 5;       // ~25 s without contact -> registration is dropped locally
const SCREENSHOT_WIDTH = 1280;       // live-view thumbnail size (keeps the upload small)
const SCREENSHOT_HEIGHT = 800;
const SCREENSHOT_JPEG_QUALITY = 55;
const RECONNECT_INTERVAL_MS = 5000;  // retry joining the last session after a network dropout
const RECONNECT_GIVE_UP_MS = 30 * 60 * 1000;
const IDLE_SAMPLE_INTERVAL_MS = 10000;   // how often the screen is compared for the inactivity display

/**
 * Talks to the teacher while registered:
 * - heartbeat (/update) every 5 s: sends our status, receives session status (screen lock, live-view interval, kick)
 * - live view: captures the primary screen in the main process and uploads it (/updatescreenshot)
 */
class CommHandler {
    constructor() {
        this.multicastClient = null;
        this.config = null;
        this.updateScheduler = null;
        this.screenshotTimer = null;
        this.screenshotBusy = false;
        this.lastSession = null;       // { clientname, servername, serverip, pin } - for the automatic reconnect
        this.lastReconnectTry = 0;
        this.registerFn = null;        // set by IpcHandler (avoids a circular import)
        this.activity = new ScreenActivityTracker();
        this.idleTimer = null;
        this.idleForced = false;       // e2e only: fixed "unchanged since" value
    }

    /** Remember the joined session so a network dropout can be healed without the student doing anything. */
    rememberSession(session) {
        this.lastSession = session;
    }

    /** Student left, was removed or the session ended: do not reconnect. */
    forgetSession() {
        this.lastSession = null;
        this.multicastClient.clientinfo.reconnecting = false;
    }

    /** Try to join the last session again (same name + token -> the teacher keeps the student's tile). */
    async tryReconnect() {
        const ci = this.multicastClient.clientinfo;
        if (ci.token || !this.lastSession || !this.registerFn) return;
        if (Date.now() - this.lastReconnectTry < RECONNECT_INTERVAL_MS) return;
        this.lastReconnectTry = Date.now();
        ci.reconnecting = this.lastSession.servername;

        // the teacher may have a new ip (e.g. other WLAN access point) - prefer the address from its beacon
        const beacon = this.multicastClient.examServerList.find((s) => s.servername === this.lastSession.servername);
        const serverip = beacon?.serverip || this.lastSession.serverip;
        const result = await this.registerFn({ ...this.lastSession, serverip });
        if (result?.status === 'success') {
            log.info('communicationhandler @ tryReconnect: connection restored');
        } else if (['WRONG_PIN', 'NAME_TAKEN', 'RECONNECT_AUTH_FAILED', 'VERSION_MISMATCH'].includes(result?.code)
            || result?.status === 'fingerprint-changed'                     // teacher app restarted -> old session is gone
            || Date.now() - this.lastSession.lostAt > RECONNECT_GIVE_UP_MS) {
            log.warn(`communicationhandler @ tryReconnect: giving up (${result?.code || result?.status || 'timeout'})`);
            this.forgetSession();
        }
    }

    init(mc, config) {
        this.multicastClient = mc;
        this.config = config;
        this.updateScheduler = new SchedulerService(this.requestUpdate.bind(this), UPDATE_INTERVAL_MS);
        this.updateScheduler.start();
        this.scheduleScreenshot();
        this.idleTimer = setInterval(() => this.sampleActivity(), IDLE_SAMPLE_INTERVAL_MS);
        AppLock.onStateChange = (state) => {
            if (state === 'grace') WindowHandler.showFromTray();   // the student must see the countdown
            WindowHandler.mainWin()?.webContents.send('applock-state', state);
        };
        AppLock.start();
    }

    stop() {
        this.updateScheduler?.stop();
        clearTimeout(this.screenshotTimer);
        clearInterval(this.idleTimer);
        AppLock.stop();
    }

    // ---- inactivity (screen unchanged) -------------------------------------

    /** Compare a small grayscale sample of the screen with the last changed one (see screenActivity.js). */
    async sampleActivity() {
        const ci = this.multicastClient.clientinfo;
        if (!ci.token) { this.activity.reset(); ci.screenUnchangedSeconds = null; return; }
        if (this.idleForced) { ci.screenUnchangedSeconds = this.activity.unchangedSeconds(); return; }
        try {
            const primary = screen.getPrimaryDisplay();
            const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: SAMPLE_WIDTH * 2, height: SAMPLE_HEIGHT * 2 } });
            const source = sources.find((s) => String(s.display_id) === String(primary.id)) || sources[0];
            if (!source || source.thumbnail.isEmpty()) throw new Error('empty capture');
            const sample = source.thumbnail.resize({ width: SAMPLE_WIDTH, height: SAMPLE_HEIGHT, quality: 'good' });
            ci.screenUnchangedSeconds = this.activity.addFrame(bgraToGray(sample.toBitmap(), SAMPLE_WIDTH, SAMPLE_HEIGHT));
        } catch {
            this.activity.reset();          // unknown (e.g. no screen recording permission) - never report a false "inactive"
            ci.screenUnchangedSeconds = null;
        }
    }

    /** e2e only: pretend the screen has been unchanged for the given seconds. */
    forceUnchanged(seconds) {
        this.idleForced = true;
        this.activity.reference = new Uint8Array(1);
        this.activity.unchangedSince = Date.now() - seconds * 1000;
        this.multicastClient.clientinfo.screenUnchangedSeconds = this.activity.unchangedSeconds();
    }

    teacherUrl(route) {
        return `https://${this.multicastClient.clientinfo.serverip}:${this.config.serverApiPort}/server/control/${route}`;
    }

    authHeaders() {
        return { 'Content-Type': 'application/json', Authorization: `Bearer ${this.multicastClient.clientinfo.token}` };
    }

    /** Heartbeat: send status, receive session status. */
    async requestUpdate() {
        const ci = this.multicastClient.clientinfo;
        syncClientDisplayInfo(ci);
        ci.screenPermission = this.screenPermissionStatus();
        if (ci.token) ci.screenUnchangedSeconds = this.activity.unchangedSeconds();   // fresh value with every heartbeat
        AppLock.connected = !!ci.token;
        ci.applock = AppLock.status();
        ci.netlock = NetLock.status();

        if (this.multicastClient.beaconsLost >= MAX_LOST_HEARTBEATS) {
            this.dropRegistration();
            return;
        }
        if (!ci.token) {
            await this.tryReconnect();
            return;
        }
        if (!ci.serverip) return;

        try {
            const response = await examApiFetch(this.teacherUrl('update'), {
                method: 'POST',
                cache: 'no-store',
                headers: this.authHeaders(),
                body: JSON.stringify({ clientinfo: ci }),
                signal: AbortSignal.timeout(4000),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            if (data.status === 'success') {
                this.multicastClient.beaconsLost = 0;
                this.processUpdate(data.serverstatus || {}, data.studentstatus || {});
                return;
            }
            if (data.message === 'removed') {   // teacher removed us (kick) or restarted the session
                log.warn('communicationhandler @ requestUpdate: registration no longer known by the teacher');
                NetLock.lift('removed', `${ci.servername}@${ci.serverip}`);
                AppLock.lift('removed', `${ci.servername}@${ci.serverip}`);
                this.forgetSession();
                this.resetConnection();
                return;
            }
            if (data.message === 'notavailable') {   // session ended, teacher app still running
                log.warn('communicationhandler @ requestUpdate: session not available anymore');
                NetLock.lift('session-ended', `${ci.servername}@${ci.serverip}`);
                AppLock.lift('session-ended', `${ci.servername}@${ci.serverip}`);
                this.forgetSession();
                this.multicastClient.beaconsLost = MAX_LOST_HEARTBEATS;
                return;
            }
            this.multicastClient.beaconsLost += 1;
            log.warn(`communicationhandler @ requestUpdate: ${data.message} (${this.multicastClient.beaconsLost})`);
        } catch (error) {
            if (isCertificateError(error)) {   // a rejected teacher certificate never recovers by retrying
                log.error('communicationhandler @ requestUpdate: certificate rejected, dropping registration');
                this.dropRegistration();
                return;
            }
            this.multicastClient.beaconsLost += 1;
            log.warn(`communicationhandler @ requestUpdate: heartbeat failed (${this.multicastClient.beaconsLost}): ${error.message}`);
        }
    }

    processUpdate(serverstatus, studentstatus) {
        const ci = this.multicastClient.clientinfo;
        this.multicastClient.serverstatus = serverstatus;

        if (studentstatus.kicked) {
            log.warn('communicationhandler @ processUpdate: removed from the session by the teacher');
            NetLock.lift('removed', `${ci.servername}@${ci.serverip}`);
            AppLock.lift('removed', `${ci.servername}@${ci.serverip}`);
            this.forgetSession();
            this.resetConnection();
            return;
        }

        AppLock.setPolicy(serverstatus.applock, `${ci.servername}@${ci.serverip}`);
        NetLock.sync(serverstatus.netlock, { hostip: this.config.hostip, teacherIp: ci.serverip, servername: ci.servername });   // async, guarded

        if (serverstatus.screenslocked && !ci.screenlock) this.activateScreenlock();
        else if (!serverstatus.screenslocked && ci.screenlock) this.killScreenlock();

        if (typeof serverstatus.screenshotinterval === 'number') {
            const intervalMs = Math.max(0, serverstatus.screenshotinterval) * 1000;
            if (intervalMs !== ci.screenshotinterval) {
                log.info(`communicationhandler @ processUpdate: live view interval -> ${intervalMs} ms`);
                ci.screenshotinterval = intervalMs;
            }
        }
    }

    activateScreenlock() {
        this.multicastClient.clientinfo.screenlock = true;
        WindowHandler.showScreenlock();
    }

    killScreenlock() {
        WindowHandler.removeScreenlock();
        this.multicastClient.clientinfo.screenlock = false;
    }

    /** Connection to the teacher lost: forget the registration but remember the token for a reconnect. */
    dropRegistration() {
        log.warn('communicationhandler @ dropRegistration: connection to teacher lost, removing registration');
        if (this.lastSession) {
            this.lastSession.lostAt = Date.now();
            this.multicastClient.clientinfo.reconnecting = this.lastSession.servername;   // shown by the renderer right away
        }
        this.multicastClient.beaconsLost = 0;
        this.resetConnection();
    }

    resetConnection() {
        const ci = this.multicastClient.clientinfo;
        if (ci.token) this.multicastClient.reconnectToken = ci.token;
        ci.token = false;
        ci.serverip = false;
        ci.servername = false;
        ci.pin = false;
        ci.screenUnchangedSeconds = null;
        this.activity.reset();
        this.idleForced = false;
        // the program lock is NOT lifted here: after a network dropout or leaving on purpose it lasts until end time + 5 min
        this.killScreenlock();   // never leave a student locked without a teacher
    }

    // ---- live view -------------------------------------------------------

    /** 'granted' | 'denied' | 'not-determined' | 'unknown' (only macOS asks for screen recording permission). */
    screenPermissionStatus() {
        if (process.platform !== 'darwin') return 'granted';
        try { return systemPreferences.getMediaAccessStatus('screen'); } catch { return 'unknown'; }
    }

    scheduleScreenshot() {
        const interval = this.multicastClient.clientinfo.screenshotinterval || UPDATE_INTERVAL_MS;
        this.screenshotTimer = setTimeout(async () => {
            await this.sendScreenshot();
            this.scheduleScreenshot();
        }, interval);
    }

    async captureScreen() {
        const primary = screen.getPrimaryDisplay();
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: SCREENSHOT_WIDTH, height: SCREENSHOT_HEIGHT },
        });
        const source = sources.find((s) => String(s.display_id) === String(primary.id)) || sources[0];
        if (!source || source.thumbnail.isEmpty()) return null;
        return source.thumbnail.toJPEG(SCREENSHOT_JPEG_QUALITY).toString('base64');
    }

    async sendScreenshot() {
        const ci = this.multicastClient.clientinfo;
        if (!ci.token || !ci.serverip || !ci.screenshotinterval || this.screenshotBusy) return;
        this.screenshotBusy = true;
        try {
            let screenshot = null;
            try {
                screenshot = await this.captureScreen();
                ci.screenCaptureError = false;
            } catch (error) {
                // typically macOS without "Screen Recording" permission; the teacher sees a badge instead of an image
                const message = error?.message || String(error);
                if (ci.screenCaptureError !== message) log.warn(`communicationhandler @ sendScreenshot: capture failed: ${message}`);
                ci.screenCaptureError = message;
            }
            await examApiFetch(this.teacherUrl('updatescreenshot'), {
                method: 'POST',
                headers: this.authHeaders(),
                body: JSON.stringify({ clientinfo: { servername: ci.servername }, screenshot }),
                signal: AbortSignal.timeout(8000),
            });
        } catch (error) {
            log.warn(`communicationhandler @ sendScreenshot: ${error?.message || error}`);
        } finally {
            this.screenshotBusy = false;
        }
    }
}

export default new CommHandler();
