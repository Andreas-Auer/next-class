import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveStatus, alarmFor, ALARM_AFTER_MS } from '../../shared/lessonRules.js';

const status = { screenslocked: true, applock: { active: true }, netlock: { active: true } };

test('locks apply only to students taking part and not released', () => {
    assert.deepEqual(effectiveStatus(status, { participating: true }), { screenslocked: true, applock: { active: true }, netlock: { active: true } });
    assert.deepEqual(effectiveStatus(status, { participating: false }), { screenslocked: false, applock: { active: false }, netlock: { active: false } });
    assert.deepEqual(effectiveStatus(status, { participating: true, released: 'temporary' }).netlock, { active: false });
});

test('alarm: app quit, connection lost, only firewall left', () => {
    const now = 1_000_000;
    assert.equal(alarmFor({ participating: true, lastSeen: now - 1000 }, now), null);
    assert.equal(alarmFor({ participating: true, lastSeen: now - 1000, quitAt: now }, now), 'quit');
    assert.equal(alarmFor({ participating: true, lastSeen: now - ALARM_AFTER_MS - 1 }, now), 'offline');
    assert.equal(alarmFor({ participating: true, lastSeen: now - ALARM_AFTER_MS - 1, netlock: { state: 'active' } }, now), 'firewall-only');
    assert.equal(alarmFor({ participating: false, quitAt: now }, now), null);
    assert.equal(alarmFor({ participating: true, absent: true }, now), null);
});
