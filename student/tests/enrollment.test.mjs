import test from 'node:test';
import assert from 'node:assert/strict';
import { decideJoin, findStudent, isNewStudent } from '../../shared/enrollment.js';
import { cleanPersonName, cleanClassName, displayName, folderName, uniqueName, deviceKeyHash } from '../../shared/studentNames.js';

const key = (c) => c.repeat(64);
const maria = { deviceKey: key('a'), firstName: 'Maria', lastName: 'Musterschülerin', className: '3aHBT' };

test('names are cleaned, class keeps its case', () => {
    assert.equal(cleanPersonName('  Maria  <b> '), 'Maria b');
    assert.equal(cleanPersonName("Anne-Marie O'Neil"), "Anne-Marie O'Neil");
    assert.equal(cleanClassName('3a HBT!'), '3aHBT');
    assert.equal(displayName(maria), 'Maria Musterschülerin');
    assert.equal(folderName(maria), 'Musterschülerin Maria');
});

test('same name in a course: class is added, then a number', () => {
    assert.equal(uniqueName(maria, []), 'Maria Musterschülerin');
    assert.equal(uniqueName(maria, ['maria musterschülerin']), 'Maria Musterschülerin (3aHBT)');
    assert.equal(uniqueName(maria, ['Maria Musterschülerin', 'Maria Musterschülerin (3aHBT)']), 'Maria Musterschülerin (3aHBT) 2');
});

test('first lesson enrolls automatically, later lessons knock', () => {
    assert.equal(decideJoin({ lessons: 1, students: [] }, maria).action, 'enroll');
    assert.equal(decideJoin({ lessons: 2, students: [] }, maria).action, 'knock');
});

test('enrolled devices are admitted, removed ones refused; the key is stored hashed', () => {
    const { student } = decideJoin({ lessons: 1, students: [] }, maria);
    assert.equal(student.key, deviceKeyHash(maria.deviceKey));
    assert.notEqual(student.key, maria.deviceKey);
    const course = { lessons: 3, students: [student] };
    assert.equal(decideJoin(course, maria).action, 'admit');
    assert.equal(findStudent(course, maria.deviceKey), student);
    assert.equal(isNewStudent(course, student), false);
    student.removed = true;
    assert.equal(decideJoin(course, maria).action, 'removed');
});

test('invalid identity is refused', () => {
    assert.equal(decideJoin({ lessons: 1 }, { ...maria, deviceKey: 'short' }).action, 'invalid');
    assert.equal(decideJoin({ lessons: 1 }, { ...maria, firstName: '' }).action, 'invalid');
});
