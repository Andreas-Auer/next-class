/**
 * @license GPL LICENSE
 * Copyright (c) 2026 Andreas Auer (Next-Class, fork of Next-Exam)
 * GNU General Public License v3 or later - see <http://www.gnu.org/licenses/>
 */

/**
 * Seating plan of a course: { rows, cols, aisles: [column indices], seats: { "row,col": studentKey } }.
 * Row 0 is the front row (next to the board), column 0 the left seen from the back of the room.
 */

const MAX = 15;

export function normalizeSeating(plan) {
    const clamp = (v, d) => Math.min(MAX, Math.max(1, Math.round(Number(v)) || d));
    const rows = clamp(plan?.rows, 6);
    const cols = clamp(plan?.cols, 7);
    const aisles = [...new Set((plan?.aisles || []).map(Number).filter((c) => Number.isInteger(c) && c >= 0 && c < cols))].sort((a, b) => a - b);
    const seats = {};
    const used = new Set();
    for (const [pos, key] of Object.entries(plan?.seats || {})) {
        const [r, c] = pos.split(',').map(Number);
        if (!(r >= 0 && r < rows && c >= 0 && c < cols) || aisles.includes(c) || typeof key !== 'string' || used.has(key)) continue;
        seats[`${r},${c}`] = key;
        used.add(key);
    }
    return { rows, cols, aisles, seats };
}

/** Put a student on a seat; a student already sitting there swaps to the old seat (or becomes unassigned). */
export function placeStudent(plan, key, row, col) {
    const p = normalizeSeating(plan);
    const target = `${row},${col}`;
    if (p.aisles.includes(col) || row >= p.rows || col >= p.cols) return p;
    const from = Object.keys(p.seats).find((pos) => p.seats[pos] === key);
    const other = p.seats[target];
    if (from) delete p.seats[from];
    if (other && other !== key && from) p.seats[from] = other;
    p.seats[target] = key;
    return normalizeSeating(p);
}

export function unseat(plan, key) {
    const p = normalizeSeating(plan);
    for (const pos of Object.keys(p.seats)) if (p.seats[pos] === key) delete p.seats[pos];
    return p;
}
