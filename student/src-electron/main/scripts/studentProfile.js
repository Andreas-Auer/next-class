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
 * The student's profile on this device (student-profile.json in the user data folder):
 *   - first name, last name, class (entered once; afterwards only a teacher can change the name)
 *   - a random device key that lets the teacher apps recognize this device (no MAC address)
 *   - the courses this device is enrolled in: { id, name, pin, teachers, displayName, lastSeen }
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { app } from 'electron';
import log from 'electron-log';
import { cleanPersonName, cleanClassName, displayName } from '../../../../shared/studentNames.js';

const COURSE_FORGET_AFTER_MS = 365 * 24 * 60 * 60 * 1000;

class StudentProfile {
    constructor() {
        this.data = null;
    }

    file() {
        return process.env.NEXT_CLASS_STUDENT_PROFILE_FILE || path.join(app.getPath('userData'), 'student-profile.json');
    }

    load() {
        if (this.data) return this.data;
        let parsed = {};
        try { parsed = JSON.parse(fs.readFileSync(this.file(), 'utf8')); } catch { /* first start */ }
        this.data = {
            firstName: cleanPersonName(parsed.firstName),
            lastName: cleanPersonName(parsed.lastName),
            className: cleanClassName(parsed.className),
            deviceKey: /^[0-9a-f]{64}$/.test(parsed.deviceKey || '') ? parsed.deviceKey : crypto.randomBytes(32).toString('hex'),
            // a course not seen for a year was most likely deleted by the teachers (the device is never told)
            courses: Array.isArray(parsed.courses) ? parsed.courses.filter((c) => c?.id && c?.pin && !(Date.now() - (Number(c.lastSeen) || Date.now()) > COURSE_FORGET_AFTER_MS)) : [],
        };
        if (!parsed.deviceKey || this.data.courses.length !== (parsed.courses || []).length) this.save();
        return this.data;
    }

    save() {
        try {
            fs.mkdirSync(path.dirname(this.file()), { recursive: true });
            fs.writeFileSync(this.file(), JSON.stringify(this.data, null, 2));
        } catch (e) {
            log.error(`studentProfile @ save: ${e.message}`);
        }
    }

    complete() {
        const d = this.load();
        return !!(d.firstName && d.lastName && d.className);
    }

    /** What the renderer shows (never the device key). */
    view() {
        const d = this.load();
        return {
            firstName: d.firstName, lastName: d.lastName, className: d.className, complete: this.complete(),
            name: displayName(d), courses: d.courses.map(({ id, name, teachers, displayName: dn }) => ({ id, name, teachers: teachers || [], displayName: dn || '' })),
        };
    }

    /** Set the name once. Afterwards it is locked (the teacher renames students in the course). */
    setName({ firstName, lastName, className } = {}) {
        if (this.complete()) return { status: 'error', code: 'LOCKED' };
        const d = this.load();
        const f = cleanPersonName(firstName);
        const l = cleanPersonName(lastName);
        const c = cleanClassName(className);
        if (!f || !l || !c) return { status: 'error', code: 'MISSING_INPUT' };
        Object.assign(d, { firstName: f, lastName: l, className: c });
        this.save();
        return { status: 'success', profile: this.view() };
    }

    /** Fields sent with every registration. The device key is hashed by the teacher app before storing. */
    identity() {
        const d = this.load();
        return { deviceKey: d.deviceKey, firstName: d.firstName, lastName: d.lastName, className: d.className };
    }

    course(id) {
        return this.load().courses.find((c) => c.id === id) || null;
    }

    /** Enrolled (or name changed by the teacher): remember the course so the device joins it by itself later. */
    rememberCourse({ id, name, pin, teachers, displayName: dn }) {
        if (!id || !pin) return;
        const d = this.load();
        const existing = d.courses.find((c) => c.id === id);
        const entry = { id, name: name || existing?.name || '', pin, teachers: teachers || existing?.teachers || [], displayName: dn || existing?.displayName || '', lastSeen: Date.now() };
        if (existing) Object.assign(existing, entry);
        else d.courses.push(entry);
        this.save();
    }

    /** The teacher removed this device from the course, or the student removed the course from "Meine Kurse". */
    forgetCourse(id) {
        const d = this.load();
        d.courses = d.courses.filter((c) => c.id !== id);
        this.save();
    }
}

export default new StudentProfile();
