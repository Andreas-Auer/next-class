/**
 * @license GPL LICENSE
 * Copyright (c) 2026 Andreas Auer (Next-Class, fork of Next-Exam)
 * GNU General Public License v3 or later - see <http://www.gnu.org/licenses/>
 */

/**
 * Course sync between teacher apps without a lesson together (no Electron imports, unit-tested).
 *
 * Every teacher app announces its courses on the LAN as { tag, version }. The tag is derived from
 * the course secret, so only apps that already have the course recognize it - the course name or id
 * is never sent. An app that sees a newer version of one of its courses fetches it (with a proof of
 * the secret) and keeps the newer one.
 */

import { courseProof } from './courseRules.js';

export const ANNOUNCE_TYPE = 'nc-courses';
export const MAX_ANNOUNCED = 200;

/** Short public identifier of a course, only computable with the secret. */
export function courseTag(secret) {
    return courseProof(secret, 'course-sync-tag').slice(0, 20);
}

export function buildAnnouncement(courses, { instance, apiPort }) {
    return {
        type: ANNOUNCE_TYPE,
        instance,
        apiPort,
        courses: courses.filter((c) => c?.secret).slice(0, MAX_ANNOUNCED).map((c) => ({ t: courseTag(c.secret), v: Number(c.updatedAt) || 0 })),
    };
}

/** Parse an announcement packet; null for anything else (session beacons, foreign packets). */
export function parseAnnouncement(text) {
    let msg;
    try { msg = JSON.parse(String(text)); } catch { return null; }
    if (!msg || msg.type !== ANNOUNCE_TYPE || typeof msg.instance !== 'string' || !Array.isArray(msg.courses)) return null;
    const apiPort = Number(msg.apiPort);
    if (!(apiPort > 0 && apiPort < 65536)) return null;
    const courses = msg.courses.slice(0, MAX_ANNOUNCED)
        .filter((c) => c && typeof c.t === 'string' && Number.isFinite(Number(c.v)))
        .map((c) => ({ t: c.t, v: Number(c.v) }));
    return { instance: msg.instance, apiPort, courses };
}

/** Own courses of which the announcement has a newer version: these are fetched. */
export function coursesToFetch(ownCourses, announcement) {
    const remote = new Map(announcement.courses.map((c) => [c.t, c.v]));
    return ownCourses.filter((c) => c?.secret && (remote.get(courseTag(c.secret)) || 0) > (Number(c.updatedAt) || 0));
}
