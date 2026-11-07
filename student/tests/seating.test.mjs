import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSeating, placeStudent, unseat } from '../../shared/seating.js';

test('default and limits', () => {
    assert.deepEqual(normalizeSeating(null), { rows: 6, cols: 7, aisles: [], seats: {} });
    const p = normalizeSeating({ rows: 99, cols: 0, aisles: [3, 3, 20] });
    assert.equal(p.rows, 15);
    assert.equal(p.cols, 7);
    assert.deepEqual(p.aisles, [3]);
});

test('place, snap and swap', () => {
    let p = normalizeSeating({ rows: 6, cols: 7, aisles: [3] });
    p = placeStudent(p, 'a', 0, 0);
    p = placeStudent(p, 'b', 0, 1);
    assert.deepEqual(p.seats, { '0,0': 'a', '0,1': 'b' });
    p = placeStudent(p, 'a', 0, 1);            // onto an occupied seat: swap
    assert.deepEqual(p.seats, { '0,1': 'a', '0,0': 'b' });
    p = placeStudent(p, 'c', 0, 3);            // aisle: ignored
    assert.equal(Object.values(p.seats).includes('c'), false);
    p = placeStudent(p, 'c', 0, 0);            // unassigned onto an occupied seat: the other becomes unassigned
    assert.equal(p.seats['0,0'], 'c');
    assert.equal(Object.values(p.seats).includes('b'), false);
    p = unseat(p, 'a');
    assert.deepEqual(p.seats, { '0,0': 'c' });
});

test('seats in a column that becomes an aisle are freed', () => {
    const p = normalizeSeating({ rows: 2, cols: 3, aisles: [1], seats: { '0,1': 'x', '0,0': 'y' } });
    assert.deepEqual(p.seats, { '0,0': 'y' });
});
