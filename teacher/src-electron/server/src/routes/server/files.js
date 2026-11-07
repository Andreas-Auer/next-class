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
 * File transfer of tasks (request body = raw file content, never JSON):
 *   students (Bearer student token)
 *     POST /control/submit/:servername/:taskId                 hand in one file (X-File-Name, X-File-Size, X-File-Sha256)
 *     GET  /control/material/:servername/:taskId/:materialId   material of the task
 *   other teacher apps of the lesson (Bearer teacher token)
 *     GET  /teacher/file/:servername/:taskId/:fileId           copy of a submission
 *     GET  /teacher/material/:servername/:taskId/:materialId   copy of the material
 *     POST /teacher/material/:servername/:taskId               add material (X-File-Name, X-File-Size, X-File-Sha256)
 */

import fs from 'fs';
import { Router } from 'express';
import log from 'electron-log';
import config from '../../../../main/config.js';
import Submissions from '../../../../main/scripts/submissions.js';
import Materials from '../../../../main/scripts/materials.js';
import { addEvent } from './control.js';

export const studentFiles = Router();
export const teacherFiles = Router();

function bearer(req) {
    return /^Bearer\s+(\S+)/i.exec(String(req.headers?.authorization || ''))?.[1] || null;
}

function studentOf(req) {
    const session = config.examServerList[req.params.servername];
    const token = bearer(req);
    const student = token && session?.studentList.find((s) => s.token === token);
    return student ? { session, student } : null;
}

function teacherOf(req) {
    const session = config.examServerList[req.params.servername];
    const token = bearer(req);
    return token && session?.coTeachers?.some((c) => c.token === token) ? session : null;
}

function meta(req) {
    let name = '';
    try { name = decodeURIComponent(String(req.get('x-file-name') || '')); } catch { /* invalid */ }
    return { name, size: Number(req.get('x-file-size')), sha256: String(req.get('x-file-sha256') || '').toLowerCase() };
}

function sendFile(res, file, name) {
    if (!file) return res.status(404).json({ status: 'error', code: 'NOT_FOUND' });
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', fs.statSync(file).size);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name || 'file')}`);
    fs.createReadStream(file).pipe(res);
    return undefined;
}

studentFiles.post('/submit/:servername/:taskId', async (req, res) => {
    req.setTimeout(0);   // large files over a slow network
    const auth = studentOf(req);
    if (!auth) { req.resume(); return res.status(401).json({ status: 'error', code: 'NOT_AUTHORIZED' }); }
    const task = auth.session.tasks?.find((t) => t.id === req.params.taskId);
    if (!task || !task.open) { req.resume(); return res.json({ status: 'error', code: 'TASK_CLOSED' }); }
    const result = await Submissions.receive(auth.session, task, auth.student, req, meta(req));
    if (result.status === 'success') addEvent(auth.session, auth.student.clientname, 'submitted', task.title);
    return res.json(result);
});

studentFiles.get('/material/:servername/:taskId/:materialId', (req, res) => {
    const auth = studentOf(req);
    if (!auth) return res.status(401).json({ status: 'error', code: 'NOT_AUTHORIZED' });
    const task = auth.session.tasks?.find((t) => t.id === req.params.taskId);
    const material = task?.materials?.find((m) => m.id === req.params.materialId);
    return sendFile(res, material && Materials.pathOf(material.id), material?.name);
});

teacherFiles.get('/file/:servername/:taskId/:fileId', (req, res) => {
    const session = teacherOf(req);
    if (!session) return res.status(401).json({ status: 'error', code: 'NOT_AUTHORIZED' });
    return sendFile(res, Submissions.pathOf(req.params.fileId), 'file');
});

teacherFiles.get('/material/:servername/:taskId/:materialId', (req, res) => {
    const session = teacherOf(req);
    if (!session) return res.status(401).json({ status: 'error', code: 'NOT_AUTHORIZED' });
    return sendFile(res, Materials.pathOf(req.params.materialId), 'material');
});

teacherFiles.post('/material/:servername/:taskId', async (req, res) => {
    req.setTimeout(0);
    const session = teacherOf(req);
    const task = session?.tasks?.find((t) => t.id === req.params.taskId);
    if (!task) { req.resume(); return res.status(401).json({ status: 'error', code: 'NOT_AUTHORIZED' }); }
    const result = await Materials.receive(task, req, meta(req));
    log.info(`files @ material: ${result.status} for "${task.title}"`);
    return res.json(result);
});
