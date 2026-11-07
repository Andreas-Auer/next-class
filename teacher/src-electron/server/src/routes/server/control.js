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
import { pinBlocked, recordPinFail } from '../../../../../../shared/pinGuard.js';
import { decideJoin } from '../../../../../../shared/enrollment.js';
import { effectiveStatus } from '../../../../../../shared/lessonRules.js';
import CourseStore from '../../../../main/scripts/courseStore.js';

const router = Router();
const { t } = i18n.global;

/** A student is considered offline after this long without a heartbeat. */
export const STUDENT_OFFLINE_AFTER_MS = 20000;

const MAX_EVENTS = 300;

/** Session event log for the teacher (memory only, never written to disk). */
export function addEvent(session, clientname, kind, detail = '', code = '') {
    if (!session.events) session.events = [];
    session.events.unshift({ at: Date.now(), clientname, kind, detail, code });   // code: translated by the dashboard
    if (session.events.length > MAX_EVENTS) session.events.length = MAX_EVENTS;
}

/** Turn new reports of the student (program lock, firewall) into session events. */
function collectStudentEvents(session, student, ci) {
    for (const v of [...(ci.applock?.violations || [])].reverse()) {
        if (v.at > (student.lastViolationAt || 0)) {
            addEvent(session, student.clientname, 'program', v.name, v.action);
            student.lastViolationAt = v.at;
        }
    }
    for (const e of [...(ci.netlock?.events || [])].reverse()) {
        if (['restored', 'restore-failed', 'apply-failed'].includes(e.kind) && e.at > (student.lastNetEventAt || 0)) {
            addEvent(session, student.clientname, 'firewall', '', e.kind === 'restored' ? (e.detail || 'rules-missing') : 'check-failed');
        }
        student.lastNetEventAt = Math.max(student.lastNetEventAt || 0, e.at);
    }
    const problem = session.serverstatus.netlock?.active && ['notinstalled', 'unreachable', 'error'].includes(ci.netlock?.state) ? ci.netlock.state : null;
    if (problem && problem !== student.netProblem) addEvent(session, student.clientname, 'netlock-problem', '', problem);
    student.netProblem = problem;
}

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
        apiPort: config.serverApiPort,
        epoch: session.serverinfo.epoch || 0,
        courseId: session.serverinfo.courseId || null,
        courseName: session.serverinfo.courseName || null,
        teachers: session.serverinfo.teachers || [],
    }));
    res.send({ serverlist, status: 'success' });
});

// ---- registration (PIN) ----------------------------------------------------

/** Join a session. Body: { packet } encrypted with the session PIN (see shared/apiSecret.js). */
router.post('/registerclient/:servername', async (req, res) => {
    const session = config.examServerList[req.params.servername];
    if (!session) return res.send({ sender: 'server', message: t('control.notfound'), status: 'error' });

    const remoteIp = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
    if (pinBlocked(remoteIp)) return res.send({ sender: 'server', message: t('control.pinblocked'), code: 'PIN_BLOCKED', status: 'error' });

    let payload;
    try {
        payload = await decryptSessionPayload(req.body?.packet, String(session.serverinfo.pin || ''));
    } catch {
        recordPinFail(remoteIp);
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

    const now = Date.now();

    // ---- course lesson: the device key decides (enrolled / first lesson / knock / removed) ----
    let courseStudent = null;
    if (session.courseId) {
        const course = CourseStore.get(session.courseId);
        if (!course) return res.send({ sender: 'server', message: t('control.notfound'), status: 'error' });
        const decision = decideJoin({ ...course, lessons: session.lessonNumber || course.lessons || 1 }, payload);
        if (decision.action === 'invalid') return res.send({ sender: 'server', message: t('control.invalidpayload'), code: 'PROFILE_MISSING', status: 'error' });
        if (decision.action === 'removed') return res.send({ sender: 'server', message: t('control.removedfromcourse'), code: 'REMOVED', courseId: course.id, status: 'error' });
        if (decision.action === 'knock') {
            const knock = session.knocks.get(decision.student.key);
            if (knock?.status === 'denied') return res.send({ sender: 'server', code: 'KNOCK_DENIED', courseName: course.name, status: 'error' });
            if (!knock) {
                session.knocks.set(decision.student.key, { student: decision.student, status: 'pending', at: now, ip: clientip });
                addEvent(session, decision.student.name, 'knock');
            } else {
                knock.at = now;
            }
            return res.send({ sender: 'server', code: 'KNOCK_PENDING', courseName: course.name, status: 'error' });
        }
        if (decision.action === 'enroll') {
            CourseStore.patch(course.id, { students: [...(course.students || []), decision.student] });
            addEvent(session, decision.student.name, 'enrolled');
        }
        courseStudent = decision.student;
    }
    const name = courseStudent ? courseStudent.name : clientname;
    const courseInfo = courseStudent ? (() => {
        const c = CourseStore.get(session.courseId);
        return { id: c.id, name: c.name, teachers: session.serverinfo.teachers || [] };
    })() : null;

    const existing = courseStudent
        ? session.studentList.find((s) => s.courseKey === courseStudent.key)
        : session.studentList.find((s) => s.clientname === clientname);

    // the app was restarted during the lesson (no token of the last registration): knock again
    if (courseStudent && existing?.participating && reconnectToken !== existing.token && !session.readmitted?.has(courseStudent.key)) {
        const knock = session.knocks.get(courseStudent.key);
        if (knock?.status === 'denied') return res.send({ sender: 'server', code: 'KNOCK_DENIED', courseName: session.serverinfo.courseName, status: 'error' });
        if (!knock) {
            session.knocks.set(courseStudent.key, { student: courseStudent, status: 'pending', at: now, ip: clientip, restart: true });
            addEvent(session, courseStudent.name, 'knock-restart');
        } else {
            knock.at = now;
        }
        return res.send({ sender: 'server', code: 'KNOCK_PENDING', courseName: session.serverinfo.courseName, status: 'error' });
    }
    if (courseStudent) session.readmitted?.delete(courseStudent.key);

    if (!existing) {
        const token = `csrf-${crypto.randomUUID()}`;
        session.studentList.push({
            clientname: name,
            courseKey: courseStudent?.key || null,
            participating: !!payload.participating,
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
        addEvent(session, name, 'joined');
        log.info(`control @ registerclient: "${name}" joined "${session.serverinfo.servername}"`);
        return res.send({ sender: 'server', message: t('control.registered'), status: 'success', token, clientname: name, course: courseInfo, participating: !!payload.participating });
    }

    // name already in the list: only the same device may take it over again (it proves this with its old token)
    // course students prove who they are with the device key; others with the token of their last registration
    if (!courseStudent && reconnectToken !== existing.token) {
        const online = now - existing.timestamp <= STUDENT_OFFLINE_AFTER_MS;
        return res.send({ sender: 'server', message: t('control.nametaken'), code: online ? 'NAME_TAKEN' : 'RECONNECT_AUTH_FAILED', status: 'error' });
    }
    existing.timestamp = now;
    existing.clientip = clientip;
    existing.version = version;
    existing.quitAt = null;
    existing.leftAt = null;
    existing.clientname = name;
    existing.participating = existing.participating || !!payload.participating;
    if (existing.released === 'permanent') existing.released = null;   // came back during the lesson: no knocking
    addEvent(session, name, 'reconnected');
    log.info(`control @ registerclient: "${name}" reconnected`);
    return res.send({ sender: 'server', message: t('control.reconnected'), status: 'success', token: existing.token, reconnected: true, clientname: name, course: courseInfo, participating: existing.participating });
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
    if (ci.netlock && typeof ci.netlock === 'object') student.netlock = ci.netlock;
    student.participating = !!ci.participating;
    // inactivity: student sends a duration (not a timestamp) so clock differences between devices do not matter
    student.unchangedSince = Number.isFinite(ci.screenUnchangedSeconds) ? student.timestamp - ci.screenUnchangedSeconds * 1000 : null;
    if (!ci.screenshotinterval) student.imageurl = false;
    collectStudentEvents(session, student, ci);

    // locks end exactly at their end time while the teacher app is running
    for (const key of ['netlock', 'applock']) {
        const lockState = session.serverstatus[key];
        if (lockState?.active && lockState.until && Date.now() >= lockState.until) {
            session.serverstatus[key] = { active: false };
            log.info(`control @ update: ${key} of "${session.serverinfo.servername}" ended (end time reached)`);
        }
    }

    const studentstatus = { ...student.status };
    if (student.status.released) {   // released for the rest of the lesson: the tile goes away
        addEvent(session, student.clientname, 'released');
        session.studentList = session.studentList.filter((s) => s !== student);
    }
    if (student.status.kicked) {
        addEvent(session, student.clientname, 'kicked');
        session.studentList = session.studentList.filter((s) => s !== student);
        log.info(`control @ update: "${student.clientname}" removed from "${session.serverinfo.servername}"`);
    }
    student.status = {};   // one-shot commands are delivered exactly once

    res.send({
        sender: 'server',
        status: 'success',
        serverstatus: {
            sessionId: session.serverinfo.id,   // stays the same after a host failover
            idlethreshold: session.serverstatus.idlethreshold,
            // locks apply only to students taking part and not released
            ...effectiveStatus(session.serverstatus, student),
            // other teacher apps of this session: the student reconnects there if this host fails
            teachers: (session.coTeachers || []).filter((c) => c.ip && Date.now() - c.lastSeen < 30000).map((c) => ({ ip: c.ip, port: c.apiPort })),
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

/**
 * Student left the session (reason "leave") or closed the app (reason "quit").
 * While a lock is active the tile stays visible with the reason, so the teacher notices it.
 */
router.post('/leave', (req, res) => {
    const auth = resolveStudent(req);
    if (!auth.ok) return authError(res, auth.reason);
    const { session, student } = auth;
    const reason = req.body?.reason === 'quit' ? 'quit' : 'leave';
    const lockActive = !!(session.serverstatus.netlock?.active || session.serverstatus.applock?.active);
    addEvent(session, student.clientname, reason === 'quit' ? 'app-quit' : 'left');
    if (reason === 'quit' || lockActive) {
        student.timestamp = 0;   // shown as offline right away
        if (reason === 'quit') student.quitAt = Date.now(); else student.leftAt = Date.now();
    } else {
        session.studentList = session.studentList.filter((s) => s !== student);
    }
    log.info(`control @ leave: "${student.clientname}" ${reason} "${session.serverinfo.servername}"`);
    res.send({ sender: 'server', status: 'success' });
});

export default router;
