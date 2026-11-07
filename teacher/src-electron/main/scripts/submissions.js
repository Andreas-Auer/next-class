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
 * Tasks and submissions of a lesson.
 *
 * The teacher app leading the lesson receives the files of the students and stores them in ITS teacher's
 * submission folder. Every other teacher app of the lesson downloads the files it does not have yet and
 * stores them in its own teacher's folder (each teacher chooses the folder per course).
 *
 * Which files are on this device is remembered in submissions-index.json (user data folder): fileId -> path.
 * Submissions themselves are only files in the teachers' folders; nothing is stored anywhere else.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { app } from 'electron';
import log from 'electron-log';
import TeacherProfile from './teacherProfile.js';
import CourseStore from './courseStore.js';
import { safeName, taskFolderName, freeFileName, DEFAULT_MAX_BYTES, datePrefix } from '../../../../shared/submissionRules.js';

class Submissions {
    constructor() {
        this.index = null;   // fileId -> absolute path on this device
    }

    indexFile() {
        return process.env.NEXT_CLASS_SUBMISSIONS_INDEX || path.join(app.getPath('userData'), 'submissions-index.json');
    }

    loadIndex() {
        if (this.index) return this.index;
        try { this.index = JSON.parse(fs.readFileSync(this.indexFile(), 'utf8')) || {}; } catch { this.index = {}; }
        return this.index;
    }

    remember(fileId, filePath) {
        this.loadIndex()[fileId] = filePath;
        try {
            fs.mkdirSync(path.dirname(this.indexFile()), { recursive: true });
            fs.writeFileSync(this.indexFile(), JSON.stringify(this.index));
        } catch (e) {
            log.error(`submissions @ remember: ${e.message}`);
        }
    }

    /** Stored on this device (and the file is still there). */
    has(fileId) {
        const p = this.loadIndex()[fileId];
        return !!p && fs.existsSync(p);
    }

    pathOf(fileId) {
        return this.has(fileId) ? this.index[fileId] : null;
    }

    /** This teacher's submission folder for a course (own folder of the course or the default). */
    folderFor(courseId) {
        const local = courseId ? CourseStore.local(courseId) : null;
        return local?.folder || TeacherProfile.folder();
    }

    /** Create a task in a lesson. The folder name is the same on every teacher device. */
    createTask(session, { title, text, deadline, maxMb, createdBy } = {}) {
        const cleanTitle = String(title || '').trim().slice(0, 120);
        if (!cleanTitle) return { status: 'error', code: 'MISSING_TITLE' };
        const folder = this.folderFor(session.courseId);
        if (!TeacherProfile.ensureFolder(folder)) return { status: 'error', code: 'FOLDER_MISSING', folder };
        const now = Date.now();
        const courseName = session.serverinfo.courseName || session.serverinfo.servername;
        let existing = [];
        try { existing = fs.readdirSync(folder).filter((n) => n.startsWith(datePrefix(now))); } catch { /* empty */ }
        const taken = [...existing, ...(session.tasks || []).map((t) => t.folderName)];
        const maxBytes = Number(maxMb) > 0 ? Math.min(Number(maxMb), 10 * 1024) * 1024 * 1024 : DEFAULT_MAX_BYTES;
        const task = {
            id: crypto.randomUUID(), title: cleanTitle, text: String(text || '').slice(0, 4000),
            deadline: Number(deadline) > now ? Number(deadline) : null, maxBytes,
            folderName: taskFolderName(courseName, cleanTitle, now, taken), createdAt: now, createdBy: createdBy || '',
            materials: [], open: true,
        };
        session.tasks = [...(session.tasks || []), task];
        session.submissions = session.submissions || {};
        session.submissions[task.id] = {};
        return { status: 'success', task };
    }

    /** Folder name of a student inside the task folder: "Musterschülerin Maria" (course) or the session name. */
    studentFolder(session, student) {
        const course = session.courseId && CourseStore.get(session.courseId);
        const rec = course?.students?.find((s) => s.key === student.courseKey);
        if (!rec) return safeName(student.clientname, 'Schüler');
        const base = safeName(`${rec.lastName} ${rec.firstName}`, 'Schüler');
        const same = course.students.filter((s) => !s.removed && s.key !== rec.key && safeName(`${s.lastName} ${s.firstName}`) === base);
        return same.length && rec.className ? `${base} (${rec.className})` : base;
    }

    /**
     * Receive one file of a student (request body = file content).
     * meta: { name, size, sha256 }. Returns { status, file } or an error code.
     */
    async receive(session, task, student, stream, meta) {
        const studentId = student.courseKey || student.clientname;
        const sub = (session.submissions[task.id][studentId] ||= { student: student.clientname, folder: this.studentFolder(session, student), files: [], firstAt: 0, lastAt: 0 });
        const size = Number(meta.size);
        if (!Number.isFinite(size) || size < 0) return { status: 'error', code: 'INVALID' };
        const used = sub.files.reduce((n, f) => n + f.size, 0);
        if (used + size > task.maxBytes) return { status: 'error', code: 'TOO_LARGE' };

        const dir = path.join(this.folderFor(session.courseId), task.folderName, sub.folder);
        try { fs.mkdirSync(dir, { recursive: true }); } catch { return { status: 'error', code: 'FOLDER_MISSING' }; }
        const tmp = path.join(dir, `.upload-${crypto.randomUUID()}`);
        const hash = crypto.createHash('sha256');
        let received = 0;
        try {
            await pipeline(stream, async function* (source) {
                for await (const chunk of source) {
                    received += chunk.length;
                    if (received > size) throw new Error('size');
                    hash.update(chunk);
                    yield chunk;
                }
            }, fs.createWriteStream(tmp));
        } catch (e) {
            fs.rmSync(tmp, { force: true });
            return { status: 'error', code: e.message === 'size' ? 'SIZE_MISMATCH' : 'INCOMPLETE' };
        }
        const sha256 = hash.digest('hex');
        if (received !== size || (meta.sha256 && meta.sha256 !== sha256)) {
            fs.rmSync(tmp, { force: true });
            return { status: 'error', code: 'INCOMPLETE' };   // the student app sends it again
        }
        let existing = [];
        try { existing = fs.readdirSync(dir); } catch { /* new */ }
        const name = freeFileName(meta.name, existing);
        const target = path.join(dir, name);
        fs.renameSync(tmp, target);
        const now = Date.now();
        const file = { id: crypto.randomUUID(), name, size, sha256, at: now };
        sub.files.push(file);
        sub.firstAt ||= now;
        sub.lastAt = now;
        this.remember(file.id, target);
        log.info(`submissions @ receive: "${student.clientname}" -> ${task.folderName}/${sub.folder}/${name} (${size} bytes)`);
        return { status: 'success', file: { name, size, at: now } };
    }

    /** Copy of a file received by another teacher app (same folder structure in this teacher's folder). */
    async storeCopy(courseId, task, sub, file, stream) {
        if (this.has(file.id)) return true;
        const dir = path.join(this.folderFor(courseId), task.folderName, sub.folder);
        fs.mkdirSync(dir, { recursive: true });
        const tmp = path.join(dir, `.download-${crypto.randomUUID()}`);
        const hash = crypto.createHash('sha256');
        try {
            await pipeline(stream, async function* (source) {
                for await (const chunk of source) { hash.update(chunk); yield chunk; }
            }, fs.createWriteStream(tmp));
        } catch (e) {
            fs.rmSync(tmp, { force: true });
            log.warn(`submissions @ storeCopy: ${e.message}`);
            return false;
        }
        if (hash.digest('hex') !== file.sha256) { fs.rmSync(tmp, { force: true }); return false; }
        let existing = [];
        try { existing = fs.readdirSync(dir); } catch { /* new */ }
        const target = path.join(dir, freeFileName(file.name, existing));
        fs.renameSync(tmp, target);
        this.remember(file.id, target);
        return true;
    }

    /** Tasks with the submission state, for the dashboards (incl. how many files are on THIS device). */
    overview(session) {
        return (session.tasks || []).map((task) => {
            const subs = session.submissions?.[task.id] || {};
            const files = Object.values(subs).flatMap((s) => s.files);
            return {
                ...task,
                submissions: Object.fromEntries(Object.entries(subs).map(([id, s]) => [id, { student: s.student, folder: s.folder, count: s.files.length, firstAt: s.firstAt, lastAt: s.lastAt, files: s.files.map((f) => ({ id: f.id, name: f.name, size: f.size, at: f.at })) }])),
                fileCount: files.length,
            };
        });
    }

    /** How many files of a task list are stored on this device. */
    localCount(fileIds) {
        return fileIds.filter((id) => this.has(id)).length;
    }
}

export default new Submissions();
