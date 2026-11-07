/**
 * @license GPL LICENSE
 * Copyright (c) 2026 Andreas Auer (Next-Class, fork of Next-Exam)
 * GNU General Public License v3 or later - see <http://www.gnu.org/licenses/>
 */

/**
 * Folder and file names for submissions (decision 2026-11-07):
 *   <submission folder>/YYYYMMDD_<course>_<first word of the task>/<last name> <first name>/<files>
 *   e.g. 20261123_BP-KU_Grundriss/Musterschülerin Maria/Grundriss.pln
 * Nothing is overwritten: a second "Grundriss.pln" becomes "Grundriss (2).pln".
 */

export const DEFAULT_MAX_BYTES = 1024 * 1024 * 1024;   // 1 GB per submission (per task and student)

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;   // Windows device names

/** A name that is valid as folder or file name on Windows, macOS and Linux. */
export function safeName(name, fallback = 'Datei') {
    let s = String(name || '').normalize('NFC')
        .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '')
        .replace(/\s+/g, ' ').trim()
        .replace(/[. ]+$/, '');                 // Windows: no trailing dot or space
    if (s.startsWith('.')) s = s.replace(/^\.+/, '');   // no hidden files
    if (!s || RESERVED.test(s.split('.')[0])) s = fallback;
    return s.slice(0, 120);
}

/** First word of the task title ("Grundriss EG" -> "Grundriss", "Übung: Dach" -> "Übung"). */
export function firstWord(title) {
    const word = String(title || '').trim().split(/[\s:;,.!?/\\-]+/u).find(Boolean) || 'Aufgabe';
    return safeName(word, 'Aufgabe');
}

export function datePrefix(ts = Date.now()) {
    const d = new Date(ts);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** "20261123_BP-KU_Grundriss"; taken folder names of the same day get "-2", "-3" ... */
export function taskFolderName(courseName, title, ts, taken = []) {
    const base = `${datePrefix(ts)}_${safeName(courseName, 'Unterricht')}_${firstWord(title)}`;
    const set = new Set([...taken].map((n) => n.toLowerCase()));
    if (!set.has(base.toLowerCase())) return base;
    for (let i = 2; i < 1000; i++) if (!set.has(`${base}-${i}`.toLowerCase())) return `${base}-${i}`;
    return `${base}-${Date.now()}`;
}

/** "Grundriss.pln" -> "Grundriss (2).pln" if taken (case-insensitive, like Windows and macOS). */
export function freeFileName(name, taken = []) {
    const clean = safeName(name);
    const set = new Set([...taken].map((n) => n.toLowerCase()));
    if (!set.has(clean.toLowerCase())) return clean;
    const dot = clean.lastIndexOf('.');
    const stem = dot > 0 ? clean.slice(0, dot) : clean;
    const ext = dot > 0 ? clean.slice(dot) : '';
    for (let i = 2; i < 10000; i++) {
        const candidate = `${stem} (${i})${ext}`;
        if (!set.has(candidate.toLowerCase())) return candidate;
    }
    return `${stem} (${Date.now()})${ext}`;
}

/** Submission state of one student: 'none' | 'done' | 'late'. */
export function submissionState(task, submission) {
    if (!submission?.files?.length) return 'none';
    return task?.deadline && submission.firstAt > task.deadline ? 'late' : 'done';
}
