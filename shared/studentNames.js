/**
 * @license GPL LICENSE
 * Copyright (c) 2026 Andreas Auer (Next-Class, fork of Next-Exam)
 * GNU General Public License v3 or later - see <http://www.gnu.org/licenses/>
 */

/** Student names: first name, last name, class (used by the student and the teacher app). */

import crypto from 'crypto';

export function cleanPersonName(name) {
    return String(name || '').replace(/[^\p{L}\p{M} '.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 30);
}

/** Class like "3aHBT": letters and digits, case kept. */
export function cleanClassName(name) {
    return String(name || '').replace(/[^\p{L}\p{N}-]/gu, '').slice(0, 10);
}

/** "Maria Musterschülerin" (shown in the apps). */
export function displayName({ firstName, lastName } = {}) {
    return [firstName, lastName].filter(Boolean).join(' ');
}

/** "Musterschülerin Maria" (submission folders). */
export function folderName({ firstName, lastName } = {}) {
    return [lastName, firstName].filter(Boolean).join(' ');
}

/** Teacher apps store only a hash of the device key. */
export function deviceKeyHash(deviceKey) {
    return crypto.createHash('sha256').update(`next-class-device:${String(deviceKey || '')}`).digest('hex');
}

/**
 * A display name that is unique in the course: same name -> add the class, still the same -> a number.
 * taken: names already used by other students of the course/lesson.
 */
export function uniqueName(student, taken) {
    const set = new Set([...taken].map((n) => n.toLowerCase()));
    const base = displayName(student);
    if (!set.has(base.toLowerCase())) return base;
    const withClass = student.className ? `${base} (${student.className})` : base;
    if (!set.has(withClass.toLowerCase())) return withClass;
    for (let i = 2; i < 100; i++) if (!set.has(`${withClass} ${i}`.toLowerCase())) return `${withClass} ${i}`;
    return `${withClass} ${crypto.randomInt(100, 999)}`;
}
