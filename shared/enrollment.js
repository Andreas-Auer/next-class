/**
 * @license GPL LICENSE
 * Copyright (c) 2026 Andreas Auer (Next-Class, fork of Next-Exam)
 * GNU General Public License v3 or later - see <http://www.gnu.org/licenses/>
 */

/**
 * Who may join a course lesson (decision 2026-11-07):
 *   - devices enrolled in the course join directly
 *   - in the FIRST lesson of a course everyone with the PIN is enrolled automatically (marked "new")
 *   - from the second lesson on, new devices knock and a teacher admits them
 *   - devices removed by a teacher are refused
 */

import { cleanPersonName, cleanClassName, deviceKeyHash, uniqueName } from './studentNames.js';

/** Course student record: { key, firstName, lastName, className, name, enrolledAt, enrolledLesson, removed? } */
export function findStudent(course, deviceKey) {
    const key = deviceKeyHash(deviceKey);
    return (course?.students || []).find((s) => s.key === key) || null;
}

/**
 * @param course        course with students[] and lessons (number of the lesson running now, 1 = first)
 * @param identity      { deviceKey, firstName, lastName, className } from the student app
 * @returns { action: 'admit' | 'enroll' | 'knock' | 'removed' | 'invalid', student? }
 */
export function decideJoin(course, identity, now = Date.now()) {
    const firstName = cleanPersonName(identity?.firstName);
    const lastName = cleanPersonName(identity?.lastName);
    const className = cleanClassName(identity?.className);
    if (!/^[0-9a-f]{64}$/.test(String(identity?.deviceKey || '')) || !firstName || !lastName) return { action: 'invalid' };

    const known = findStudent(course, identity.deviceKey);
    if (known?.removed) return { action: 'removed', student: known };
    if (known) return { action: 'admit', student: known };

    const taken = (course.students || []).filter((s) => !s.removed).map((s) => s.name);
    const student = {
        key: deviceKeyHash(identity.deviceKey), firstName, lastName, className,
        name: uniqueName({ firstName, lastName, className }, taken),
        enrolledAt: now, enrolledLesson: course.lessons || 1,
    };
    return { action: (course.lessons || 1) <= 1 ? 'enroll' : 'knock', student };
}

/** "new" badge: enrolled in the lesson that is running now. */
export function isNewStudent(course, student) {
    return !!student && student.enrolledLesson === (course?.lessons || 1);
}
