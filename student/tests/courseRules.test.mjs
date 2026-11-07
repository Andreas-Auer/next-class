import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCourseName, newPin, cleanTime, lessonEnd, sharedCourse, courseProof, sessionNameFor } from '../../shared/courseRules.js';
import { pinBlocked, recordPinFail, resetPinGuard } from '../../shared/pinGuard.js';

test('course names keep letters, digits and - . _', () => {
    assert.equal(cleanCourseName('  BP-KU  '), 'BP-KU');
    assert.equal(cleanCourseName('Übung <script>'), 'Übung script');
    assert.equal(cleanCourseName(''), '');
});

test('course PIN has 6 digits', () => {
    for (let i = 0; i < 50; i++) assert.match(newPin(), /^\d{6}$/);
});

test('course time: clock time or duration, invalid input falls back to 50 min', () => {
    assert.deepEqual(cleanTime({ mode: 'clock', start: '08:00', end: '09:40' }), { mode: 'clock', start: '08:00', end: '09:40' });
    assert.deepEqual(cleanTime({ mode: 'clock', start: '09:40', end: '08:00' }), { mode: 'duration', minutes: 50 });
    assert.deepEqual(cleanTime({ mode: 'duration', minutes: 100 }), { mode: 'duration', minutes: 100 });
    assert.deepEqual(cleanTime({ mode: 'duration', minutes: 999 }), { mode: 'duration', minutes: 50 });
    assert.deepEqual(cleanTime(null), { mode: 'duration', minutes: 50 });
});

test('lesson end: today at the end time, or from now for a duration', () => {
    const now = new Date(2026, 10, 23, 8, 5).getTime();
    assert.equal(lessonEnd({ mode: 'clock', start: '08:00', end: '09:40' }, now), new Date(2026, 10, 23, 9, 40).getTime());
    assert.equal(lessonEnd({ mode: 'duration', minutes: 100 }, now), now + 100 * 60_000);
    // lesson already over -> 50 minutes from now
    const late = new Date(2026, 10, 23, 11, 0).getTime();
    assert.equal(lessonEnd({ mode: 'clock', start: '08:00', end: '09:40' }, late), late + 50 * 60_000);
});

test('shared course part keeps only known fields', () => {
    const c = sharedCourse({ id: 'a', name: 'BP-KU', pin: '123456', secret: 's', extra: 1, teachers: [{ name: 'A', token: 'x' }] });
    assert.equal(c.extra, undefined);
    assert.deepEqual(c.teachers, [{ name: 'A' }]);
});

test('course proof depends on secret and nonce', () => {
    assert.equal(courseProof('s', 'n1'), courseProof('s', 'n1'));
    assert.notEqual(courseProof('s', 'n1'), courseProof('s', 'n2'));
    assert.notEqual(courseProof('s', 'n1'), courseProof('t', 'n1'));
});

test('session name from course name', () => {
    assert.equal(sessionNameFor('BP-KU'), 'bp-ku');
    assert.equal(sessionNameFor('Küche/2'), 'küche-2');
    assert.equal(sessionNameFor('!!!'), 'kurs');
});

test('PIN guard blocks a device after too many wrong PINs', () => {
    resetPinGuard();
    const t0 = 1_000_000;
    for (let i = 0; i < 20; i++) recordPinFail('10.0.0.9', t0 + i);
    assert.equal(pinBlocked('10.0.0.9', t0 + 100), false);
    recordPinFail('10.0.0.9', t0 + 200);
    assert.equal(pinBlocked('10.0.0.9', t0 + 300), true);
    assert.equal(pinBlocked('10.0.0.8', t0 + 300), false);
    assert.equal(pinBlocked('10.0.0.9', t0 + 300 + 2 * 60 * 1000), false);
});
