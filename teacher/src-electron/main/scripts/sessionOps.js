/**
 * @license GPL LICENSE
 * Copyright (c) 2026 Andreas Auer (Next-Class, fork of Next-Exam)
 * GNU General Public License v3 or later - see <http://www.gnu.org/licenses/>
 */

/**
 * Session operations shared by the local dashboard (IPC) and co-teachers (HTTPS /server/teacher/rpc).
 * Filled by ipchandler.js; read by the teacher routes (avoids a circular import).
 */
export const sessionOps = {};

/** Operations a co-teacher may call on the host. Everything else stays local. */
export const REMOTE_OPS = new Set([
    'getSessionInfo', 'studentlist', 'sessionEvents', 'setServerStatus', 'kickStudent', 'setAppLock', 'setNetLock', 'teacherList',
    'replicaState', 'syncCourse', 'knockList', 'decideKnock', 'renameStudent', 'removeCourseStudent', 'releaseStudent',
]);
