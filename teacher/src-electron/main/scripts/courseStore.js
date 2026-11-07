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
 * Courses of this teacher (courses.json in the user data folder).
 *
 * A course is shared by its teachers: whenever they teach a lesson together, the course definition is
 * exchanged and the newer version wins (no server). Two settings stay on each teacher's own device:
 * the submission folder and the seating plan view (front/back).
 *
 * The course secret lets teachers of the course join each other's lessons without teacher code and approval.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { app } from 'electron';
import log from 'electron-log';

import { cleanCourseName, newPin, cleanTime, sharedCourse, courseProof } from '../../../../shared/courseRules.js';

export { cleanCourseName, newPin, cleanTime, lessonEnd, sharedCourse } from '../../../../shared/courseRules.js';

class CourseStore {
    constructor() {
        this.data = null;
    }

    file() {
        return process.env.NEXT_CLASS_COURSES_FILE || path.join(app.getPath('userData'), 'courses.json');
    }

    load() {
        if (this.data) return this.data;
        try {
            const parsed = JSON.parse(fs.readFileSync(this.file(), 'utf8'));
            this.data = { courses: (parsed.courses || []).map(sharedCourse), local: parsed.local || {}, deleted: parsed.deleted || [] };
        } catch {
            this.data = { courses: [], local: {}, deleted: [] };
        }
        return this.data;
    }

    save() {
        try {
            fs.mkdirSync(path.dirname(this.file()), { recursive: true });
            fs.writeFileSync(this.file(), JSON.stringify(this.data, null, 2));
        } catch (e) {
            log.error(`courseStore @ save: ${e.message}`);
        }
    }

    get(id) {
        return this.load().courses.find((c) => c.id === id) || null;
    }

    /** Settings of a course that stay on this device: { folder, view }. */
    local(id) {
        return { folder: '', view: 'front', ...(this.load().local[id] || {}) };
    }

    setLocal(id, patch) {
        const d = this.load();
        d.local[id] = { ...this.local(id), ...patch };
        this.save();
        return d.local[id];
    }

    /** Courses for the start page (without the secret). */
    list() {
        return this.load().courses.map((c) => ({ ...sharedCourse(c), secret: undefined, local: this.local(c.id) }))
            .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    }

    nameTaken(name, exceptId) {
        return this.load().courses.some((c) => c.id !== exceptId && c.name.toLowerCase() === name.toLowerCase());
    }

    create({ name, time, templateId, netExceptions } = {}, teacherName) {
        const clean = cleanCourseName(name);
        if (!clean) return { status: 'error', code: 'MISSING_NAME' };
        if (this.nameTaken(clean)) return { status: 'error', code: 'NAME_TAKEN' };
        const course = sharedCourse({
            id: crypto.randomUUID(), name: clean, pin: newPin(), secret: crypto.randomBytes(32).toString('hex'),
            templateId, netExceptions, time, teachers: teacherName ? [{ name: teacherName }] : [], updatedAt: Date.now(),
        });
        this.load().courses.push(course);
        this.save();
        return { status: 'success', course: { ...course, secret: undefined } };
    }

    /** Change shared settings: { id, name?, time?, templateId?, netExceptions?, newPin? }. */
    update({ id, name, time, templateId, netExceptions, regeneratePin } = {}) {
        const c = this.get(id);
        if (!c) return { status: 'error', code: 'NOT_FOUND' };
        if (name !== undefined) {
            const clean = cleanCourseName(name);
            if (!clean) return { status: 'error', code: 'MISSING_NAME' };
            if (this.nameTaken(clean, id)) return { status: 'error', code: 'NAME_TAKEN' };
            c.name = clean;
        }
        if (time !== undefined) c.time = cleanTime(time);
        if (templateId !== undefined) c.templateId = String(templateId || '');
        if (netExceptions !== undefined) c.netExceptions = (netExceptions || []).map((e) => String(e).trim()).filter(Boolean).slice(0, 100);
        if (regeneratePin) c.pin = newPin();
        c.updatedAt = Date.now();
        this.save();
        return { status: 'success', course: { ...sharedCourse(c), secret: undefined } };
    }

    /** Apply a change made in a lesson (students, seating, lesson count, teachers) without touching the rest. */
    patch(id, fields) {
        const c = this.get(id);
        if (!c) return null;
        Object.assign(c, fields, { updatedAt: Date.now() });
        this.save();
        return c;
    }

    removeTeacher(id, name) {
        const c = this.get(id);
        if (!c) return { status: 'error' };
        c.teachers = c.teachers.filter((t) => t.name !== name);
        c.updatedAt = Date.now();
        this.save();
        return { status: 'success' };
    }

    /** Delete on this device; remembered so that a later sync does not bring it back. */
    remove(id) {
        const d = this.load();
        d.courses = d.courses.filter((c) => c.id !== id);
        delete d.local[id];
        if (!d.deleted.includes(id)) d.deleted.push(id);
        this.save();
        return { status: 'success' };
    }

    /**
     * A course definition from another teacher of the course (lesson together).
     * The newer version wins; this teacher is added if missing. Returns the stored course.
     */
    merge(remote, ownName) {
        if (!remote?.id || !remote.secret) return null;
        const d = this.load();
        if (d.deleted.includes(remote.id)) return null;
        const incoming = sharedCourse(remote);
        let c = this.get(remote.id);
        if (!c) {
            c = incoming;
            d.courses.push(c);
        } else if ((incoming.updatedAt || 0) > (c.updatedAt || 0)) {
            Object.assign(c, incoming);
        }
        if (ownName && !c.teachers.some((t) => t.name === ownName)) c.teachers.push({ name: ownName });
        // a renamed course could clash with another local course of the same name
        if (this.nameTaken(c.name, c.id)) c.name = cleanCourseName(`${c.name} (2)`);
        this.save();
        return c;
    }

    /** Proof that the caller knows the course secret (sent instead of the secret itself). */
    static proof(secret, nonce) {
        return courseProof(secret, nonce);
    }
}

export { CourseStore };
export default new CourseStore();
