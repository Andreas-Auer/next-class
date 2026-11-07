/**
 * @license GPL LICENSE
 * Copyright (c) 2026 Andreas Auer (Next-Class, fork of Next-Exam)
 * GNU General Public License v3 or later - see <http://www.gnu.org/licenses/>
 */

/**
 * Lesson flow (decision 2026-11-07):
 *   - students of a live course are connected automatically ("online – dem Unterricht nicht beigetreten")
 *     and take part with "Am Unterricht teilnehmen"; joining with the PIN counts as taking part
 *   - locks only apply to students taking part and not released
 *   - release "temporary": locks lifted, the student stays in the lesson and the teacher can take it back
 *     release "permanent": the student leaves the lesson; coming back during the lesson needs no knocking
 *   - alarm (sound + red) when a participating student quits the app, loses the connection for ~10 s,
 *     or only the firewall is left (app gone, helper still locking)
 */

export const ALARM_AFTER_MS = 10_000;
export const LESSON_GRACE_SECONDS = 10;      // warning before programs are closed
export const LESSON_FORCE_AFTER_MS = 10_000; // polite close first, hard kill after this

const OFF = { active: false };

/** The lock state a student receives with the heartbeat. */
export function effectiveStatus(serverstatus, student) {
    const locked = !!student?.participating && !student?.released;
    return {
        screenslocked: locked && !!serverstatus.screenslocked,
        applock: locked ? (serverstatus.applock || OFF) : OFF,
        netlock: locked ? (serverstatus.netlock || OFF) : OFF,
    };
}

/** Alarm reason for a student tile, or null. */
export function alarmFor(student, now = Date.now()) {
    if (!student?.participating || student.released === 'permanent' || student.absent) return null;
    if (student.quitAt) return 'quit';
    if (student.netlock?.state === 'active' && now - (student.lastSeen || 0) > ALARM_AFTER_MS) return 'firewall-only';
    if (student.lastSeen && now - student.lastSeen > ALARM_AFTER_MS) return 'offline';
    return null;
}
