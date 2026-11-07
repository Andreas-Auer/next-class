/**
 * @license GPL LICENSE
 * Copyright (c) 2026 Andreas Auer (Next-Class, fork of Next-Exam)
 * GNU General Public License v3 or later - see <http://www.gnu.org/licenses/>
 */

/** Rules for courses (no Electron imports, unit-tested in student/tests). */

import crypto from 'crypto';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function cleanCourseName(name) {
    return String(name || '').replace(/[^\p{L}\p{N} ._-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

export function newPin() {
    return String(crypto.randomInt(100000, 1000000));
}

/** Course time: clock time (08:00-09:40) or a duration in minutes. */
export function cleanTime(time) {
    if (time?.mode === 'clock' && TIME_PATTERN.test(time.start) && TIME_PATTERN.test(time.end) && time.start < time.end) {
        return { mode: 'clock', start: time.start, end: time.end };
    }
    const minutes = Math.round(Number(time?.minutes));
    if (time?.mode === 'duration' && minutes >= 5 && minutes <= 240) return { mode: 'duration', minutes };
    return { mode: 'duration', minutes: 50 };
}

/** End of today's lesson as a timestamp (clock: today's end time; duration: from now). */
export function lessonEnd(time, now = Date.now()) {
    const t = cleanTime(time);
    if (t.mode === 'duration') return now + t.minutes * 60_000;
    const [h, m] = t.end.split(':').map(Number);
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    return d.getTime() > now ? d.getTime() : now + 50 * 60_000;   // lesson already over -> 50 min
}

/** The part of a course that is shared between its teachers. */
export function sharedCourse(c) {
    if (!c) return null;
    return {
        id: c.id, name: c.name, pin: c.pin, secret: c.secret, templateId: c.templateId || '',
        netExceptions: [...(c.netExceptions || [])], time: cleanTime(c.time),
        teachers: (c.teachers || []).map((t) => ({ name: t.name })),
        students: c.students || [], seating: c.seating || null, lessons: c.lessons || 0,
        updatedAt: c.updatedAt || 0,
    };
}

/** Proof that the caller knows the course secret (sent instead of the secret itself). */
export function courseProof(secret, nonce) {
    return crypto.createHmac('sha256', String(secret)).update(`next-class-course:${nonce}`).digest('hex');
}

/** Course lessons use the course name as session name (lower case, characters the apps can show). */
export function sessionNameFor(courseName) {
    return String(courseName || '').toLowerCase().replace(/[^a-z0-9äöüß _.-]/g, '-').replace(/^[^a-z0-9äöüß]+/, '').slice(0, 40) || 'kurs';
}
