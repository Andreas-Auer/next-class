// Course sync between teacher apps: tags, announcements, which courses are fetched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courseTag, buildAnnouncement, parseAnnouncement, coursesToFetch, ANNOUNCE_TYPE } from '../../shared/courseSync.js';

const a = { id: 'c1', name: 'BP-KU', secret: 'a'.repeat(64), updatedAt: 1000 };
const b = { id: 'c2', name: 'GZ', secret: 'b'.repeat(64), updatedAt: 2000 };

test('the tag depends on the secret only and reveals neither name nor id', () => {
    assert.equal(courseTag(a.secret), courseTag(a.secret));
    assert.notEqual(courseTag(a.secret), courseTag(b.secret));
    const text = JSON.stringify(buildAnnouncement([a, b], { instance: 'x', apiPort: 22522 }));
    for (const secretBit of [a.id, a.name, a.secret, b.id, b.name]) assert.ok(!text.includes(secretBit), secretBit);
});

test('announcements round-trip; foreign packets are ignored', () => {
    const msg = buildAnnouncement([a], { instance: 'x', apiPort: 22522 });
    assert.equal(msg.type, ANNOUNCE_TYPE);
    assert.deepEqual(parseAnnouncement(JSON.stringify(msg)), { instance: 'x', apiPort: 22522, courses: [{ t: courseTag(a.secret), v: 1000 }] });
    assert.equal(parseAnnouncement('{"servername":"bp-ku","id":"1"}'), null);   // session beacon
    assert.equal(parseAnnouncement('garbage'), null);
    assert.equal(parseAnnouncement(JSON.stringify({ ...msg, apiPort: 99999 })), null);
});

test('only own courses with a newer remote version are fetched', () => {
    const remote = parseAnnouncement(JSON.stringify(buildAnnouncement([{ ...a, updatedAt: 1500 }, { ...b, updatedAt: 1500 }], { instance: 'y', apiPort: 1 })));
    assert.deepEqual(coursesToFetch([a, b], remote).map((c) => c.id), ['c1']);   // c2 is newer here
    const unknown = parseAnnouncement(JSON.stringify(buildAnnouncement([{ id: 'z', secret: 'z'.repeat(64), updatedAt: 9 }], { instance: 'y', apiPort: 1 })));
    assert.deepEqual(coursesToFetch([a, b], unknown), []);   // a course this app does not have is never fetched
});
