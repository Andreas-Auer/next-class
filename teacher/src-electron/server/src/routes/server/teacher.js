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
 * Co-teacher API of the host teacher app.
 *   POST /join/:servername   { packet }  encrypted with the teacher code -> request waits for the host's approval
 *   POST /joinstatus         { servername, requestId } -> pending | denied | approved (+ token)
 *   POST /rpc                { servername, method, args }  Bearer co-teacher token -> same operations as the host dashboard
 */

import crypto from 'crypto';
import { Router } from 'express';
import log from 'electron-log';
import config from '../../../../main/config.js';
import { decryptSessionPayload } from '../../../../../../shared/apiSecret.js';
import { sessionOps, REMOTE_OPS } from '../../../../main/scripts/sessionOps.js';

const router = Router();
const MAX_PENDING = 10;
const REQUEST_TTL_MS = 5 * 60 * 1000;

function cleanName(name) {
    return String(name || '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 40);
}

router.post('/join/:servername', async (req, res) => {
    const session = config.examServerList[req.params.servername];
    if (!session?.teacherCode) return res.send({ status: 'error', code: 'NOT_FOUND' });

    let payload;
    try {
        payload = await decryptSessionPayload(req.body?.packet, session.teacherCode);
    } catch {
        return res.send({ status: 'error', code: 'WRONG_CODE' });
    }
    if (payload?.code !== session.teacherCode) return res.send({ status: 'error', code: 'WRONG_CODE' });
    const name = cleanName(payload.name);
    if (!name) return res.send({ status: 'error', code: 'MISSING_NAME' });

    // forget old requests, limit open ones (the host has to click each of them)
    for (const [id, r] of session.pendingJoins) if (Date.now() - r.at > REQUEST_TTL_MS) session.pendingJoins.delete(id);
    if ([...session.pendingJoins.values()].filter((r) => r.status === 'pending').length >= MAX_PENDING) {
        return res.send({ status: 'error', code: 'TOO_MANY' });
    }
    const requestId = crypto.randomUUID();
    const apiPort = Number(payload.apiPort) > 0 && Number(payload.apiPort) < 65536 ? Number(payload.apiPort) : config.serverApiPort;
    const ip = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
    session.pendingJoins.set(requestId, { name, ip, apiPort, at: Date.now(), status: 'pending' });
    log.info(`teacher @ join: "${name}" asks to join "${req.params.servername}"`);
    return res.send({ status: 'pending', requestId });
});

router.post('/joinstatus', (req, res) => {
    const session = config.examServerList[req.body?.servername];
    const r = session?.pendingJoins?.get(req.body?.requestId);
    if (!r) return res.send({ status: 'error', code: 'NOT_FOUND' });
    if (r.status === 'approved') {
        session.pendingJoins.delete(req.body.requestId);   // the token is handed out exactly once
        return res.send({ status: 'approved', token: r.token, servername: req.body.servername });
    }
    return res.send({ status: r.status });
});

/** A co-teacher that already belongs to the session (same token) connects to the new host after a failover. */
router.post('/rejoin', (req, res) => {
    const session = config.examServerList[req.body?.servername];
    const token = /^Bearer\s+(\S+)/i.exec(String(req.headers?.authorization || ''))?.[1];
    const teacher = session?.coTeachers?.find((c) => c.token === token);
    if (!teacher) return res.send({ status: 'error', code: 'NOT_AUTHORIZED' });
    teacher.lastSeen = Date.now();
    teacher.ip = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
    return res.send({ status: 'success', epoch: session.serverinfo.epoch || 0 });
});

router.post('/rpc', async (req, res) => {
    const { servername, method, args } = req.body || {};
    const session = config.examServerList[servername];
    if (!session) return res.send({ status: 'error', code: 'SESSION_ENDED' });
    const token = /^Bearer\s+(\S+)/i.exec(String(req.headers?.authorization || ''))?.[1];
    const teacher = session.coTeachers?.find((c) => c.token === token);
    if (!teacher) return res.send({ status: 'error', code: 'NOT_AUTHORIZED' });
    if (!REMOTE_OPS.has(method) || typeof sessionOps[method] !== 'function') return res.send({ status: 'error', code: 'UNKNOWN_METHOD' });

    teacher.lastSeen = Date.now();
    // the session is always the co-teacher's own session, never another one on this host
    const scoped = args && typeof args === 'object' && !Array.isArray(args) ? { ...args, servername } : servername;
    try {
        const result = await sessionOps[method](scoped);
        return res.send({ status: 'success', result });
    } catch (e) {
        log.error(`teacher @ rpc ${method}: ${e.message}`);
        return res.send({ status: 'error', code: 'FAILED' });
    }
});

export default router;
