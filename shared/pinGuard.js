/**
 * @license GPL LICENSE
 * Copyright (c) 2026 Andreas Auer (Next-Class, fork of Next-Exam)
 * GNU General Public License v3 or later - see <http://www.gnu.org/licenses/>
 */

/**
 * Protection against trying out PINs: more than PIN_MAX_FAILS wrong PINs from one device within
 * PIN_WINDOW_MS block further attempts for PIN_BLOCK_MS. A student app tries each lesson in the
 * room once per click, so normal use stays far below the limit.
 */
const PIN_MAX_FAILS = 20;
const PIN_WINDOW_MS = 5 * 60 * 1000;
const PIN_BLOCK_MS = 2 * 60 * 1000;
const pinFails = new Map();   // ip -> { count, since, blockedUntil }

export function resetPinGuard() { pinFails.clear(); }

export function pinBlocked(ip, now = Date.now()) {
    const f = pinFails.get(ip);
    return !!f && f.blockedUntil > now;
}

export function recordPinFail(ip, now = Date.now()) {
    let f = pinFails.get(ip);
    if (!f || now - f.since > PIN_WINDOW_MS) f = { count: 0, since: now, blockedUntil: 0 };
    f.count += 1;
    if (f.count > PIN_MAX_FAILS) { f.blockedUntil = now + PIN_BLOCK_MS; f.count = 0; f.since = now; }
    pinFails.set(ip, f);
    if (pinFails.size > 2000) for (const [k, v] of pinFails) if (now - v.since > PIN_WINDOW_MS && v.blockedUntil < now) pinFails.delete(k);
}

