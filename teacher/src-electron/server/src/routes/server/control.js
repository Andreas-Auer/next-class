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

/**
 * Student-facing API.
 * Open (app secret only): /pong, /serverlist.  PIN-protected: /registerclient.
 * Bearer student token: /update, /updatescreenshot, /leave.
 */

import crypto from 'crypto';
import { Router } from 'express';
import log from 'electron-log';
import config from '../../../../main/config.js';
import i18n from '../../../../../src/locales/locales.js';
import { normalizeStudentClientName } from '../../../../../../shared/normalizeStudentClientName.js';
import { decryptSessionPayload } from '../../../../../../shared/apiSecret.js';

const router = Router();
const { t } = i18n.global;

/** A student is considered offline after this long without a heartbeat. */
export const STUDENT_OFFLINE_AFTER_MS = 20000;

// ---- open routes -----------------------------------------------------------

router.get('/pong', (_req, res) => res.send('pong'));

/** Running sessions on this teacher app (manual join by IP when multicast is blocked). */
router.get('/serverlist', (_req, res) => {
    const serverlist = Object.values(config.examServerList).map((session) => ({
        servername: session.serverinfo.servername,
        id: session.serverinfo.id,
        serverip: session.serverinfo.ip,
        reachable: true,
        version: session.serverinfo.version,
        tlsFingerprint: config.tlsCertificateFingerprint,
    }));
    res.send({ serverlist, status: 'success' });
});

// ---- registration (PIN) ----------------------------------------------------

/** Join a session. Body: { packet } encrypted with the session PIN (see shared/apiSecret.js). */
router.post('/registerclient/:servername', async (req, res) => {
    const session = config.examServerList[req.params.servername];
    if (!session) return res.send({ sender: 'server', message: t('control.notfound'), status: 'error' });

    let payload;
    try {
        payload = await decryptSessionPayload(req.body?.packet, String(session.serverinfo.pin || ''));
    } catch {
        return res.send({ sender: 'server', message: t('control.wrongpin'), code: 'WRONG_PIN', status: 'error' });   // wrong PIN -> decryption fails
    }

    const clientname = normalizeStudentClientName(payload?.clientname);
    const { clientip, hostname, version, pin, reconnectToken } = payload || {};
    if (!pin || !clientname || !clientip || !hostname || !version) {
        return res.send({ sender: 'server', message: t('control.invalidpayload'), status: 'error' });
    }
    if (pin !== session.serverinfo.pin) return res.send({ sender: 'server', message: t('control.wrongpin'), code: 'WRONG_PIN', status: 'error' });

    // major.minor must match - protocol changes between minor versions
    const majorMinor = (v) => String(v).split('.').slice(0, 2).join('.');
    if (majorMinor(version) !== majorMinor(config.version)) {
        return res.send({ sender: 'server', message: t('control.versionmismatch', { version: config.version }), code: 'VERSION_MISMATCH', status: 'error' });
    }

    const existing = session.studentList.find((s) => s.clientname === clientname);
    const now = Date.now();

    if (!existing) {
        const token = `csrf-${crypto.randomUUID()}`;
        session.studentList.push({
            clientname,
            hostname,
            clientip,
            token,
            version,
            timestamp: now,
            joinedAt: now,
            imageurl: false,
            screenlock: false,
            status: {},   // one-shot commands for this student, delivered with the next /update
        });
        log.info(`control @ registerclient: "${clientname}" joined "${session.serverinfo.servername}"`);
        return res.send({ sender: 'server', message: t('control.registered'), status: 'success', token });
    }

    // name already in the list: only the same device may take it over again (it proves this with its old token)
    if (reconnectToken !== existing.token) {
        const online = now - existing.timestamp <= STUDENT_OFFLINE_AFTER_MS;
        return res.send({ sender: 'server', message: t('control.nametaken'), code: online ? 'NAME_TAKEN' : 'RECONNECT_AUTH_FAILED', status: 'error' });
    }
    existing.timestamp = now;
    existing.clientip = clientip;
    existing.version = version;
    log.info(`control @ registerclient: "${clientname}" reconnected`);
    return res.send({ sender: 'server', message: t('control.reconnected'), status: 'success', token: existing.token, reconnected: true });
});

// ---- token routes ----------------------------------------------------------

function bearerToken(req) {
    const m = /^Bearer\s+(\S+)/i.exec(String(req.headers?.authorization || '').trim());
    return m ? m[1] : null;
}

/** Resolve session + student by bearer token; reason: authrequired | notavailable | removed. */
function resolveStudent(req) {
    const token = bearerToken(req);
    if (!token) return { ok: false, reason: 'authrequired' };
    const session = config.examServerList[req.body?.clientinfo?.servername];
    if (!session) return { ok: false, reason: 'notavailable' };
    const student = session.studentList.find((s) => s.token === token);
    if (!student) return { ok: false, reason: 'removed' };
    return { ok: true, session, student };
}

function authError(res, reason) {
    return res.send({ sender: 'server', message: reason, status: 'error' });
}

/** Heartbeat: store student status, return session status + pending one-shot commands. */
router.post('/update', (req, res) => {
    const auth = resolveStudent(req);
    if (!auth.ok) return authError(res, auth.reason);
    const { session, student } = auth;
    const ci = req.body.clientinfo;

    student.timestamp = Date.now();
    student.version = ci.version;
    student.screenlock = !!ci.screenlock;
    student.screenshotinterval = ci.screenshotinterval;
    if (typeof ci.displayCount === 'number') student.displayCount = ci.displayCount;
    if (typeof ci.multiMonitor === 'boolean') student.multiMonitor = ci.multiMonitor;
    if (typeof ci.screenPermission === 'string') student.screenPermission = ci.screenPermission;
    student.screenCaptureFailed = !!ci.screenCaptureError;
    if (typeof ci.platform === 'string') student.platform = ci.platform;
    if (ci.applock && typeof ci.applock === 'object') student.applock = ci.applock;
    // inactivity: student sends a duration (not a timestamp) so clock differences between devices do not matter
    student.unchangedSince = Number.isFinite(ci.screenUnchangedSeconds) ? student.timestamp - ci.screenUnchangedSeconds * 1000 : null;
    if (!ci.screenshotinterval) student.imageurl = false;

    const studentstatus = { ...student.status };
    if (student.status.kicked) {
        session.studentList = session.studentList.filter((s) => s !== student);
        log.info(`control @ update: "${student.clientname}" removed from "${session.serverinfo.servername}"`);
    }
    student.status = {};   // one-shot commands are delivered exactly once

    res.send({
        sender: 'server',
        status: 'success',
        serverstatus: {
            screenslocked: !!session.serverstatus.screenslocked,
            idlethreshold: session.serverstatus.idlethreshold,
            applock: session.serverstatus.applock || { active: false },
            screenshotinterval: session.serverstatus.screenshotinterval,
        },
        studentstatus,
    });
});

/** Live view: latest screenshot is kept in memory only (never written to disk). */
router.post('/updatescreenshot', (req, res) => {
    const auth = resolveStudent(req);
    if (!auth.ok) return authError(res, auth.reason);
    const { student } = auth;
    const screenshot = req.body.screenshot;
    student.imageurl = typeof screenshot === 'string' && screenshot.length > 0 ? `data:image/jpeg;base64,${screenshot}` : false;
    student.imageTimestamp = Date.now();
    res.send({ sender: 'server', status: 'success' });
});

/** Student left the session on purpose. */
router.post('/leave', (req, res) => {
    const auth = resolveStudent(req);
    if (!auth.ok) return authError(res, auth.reason);
    const { session, student } = auth;
    session.studentList = session.studentList.filter((s) => s !== student);
    log.info(`control @ leave: "${student.clientname}" left "${session.serverinfo.servername}"`);
    res.send({ sender: 'server', status: 'success' });
});

export default router;
