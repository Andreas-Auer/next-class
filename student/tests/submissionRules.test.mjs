import test from 'node:test';
import assert from 'node:assert/strict';
import { safeName, firstWord, taskFolderName, freeFileName, submissionState, datePrefix } from '../../shared/submissionRules.js';

test('safe names for Windows, macOS and Linux', () => {
    assert.equal(safeName('Grundriss: EG/OG?.pln'), 'Grundriss EGOG.pln');
    assert.equal(safeName('..\\..\\evil'), 'evil');
    assert.equal(safeName('CON.txt'), 'Datei');
    assert.equal(safeName('name. '), 'name');
    assert.equal(safeName(''), 'Datei');
    assert.equal(safeName('Übung Dach'), 'Übung Dach');
});

test('first word of the task title', () => {
    assert.equal(firstWord('Grundriss EG'), 'Grundriss');
    assert.equal(firstWord('Übung: Dach'), 'Übung');
    assert.equal(firstWord('   '), 'Aufgabe');
});

test('task folder: date, course, first word; same word on the same day gets -2', () => {
    const ts = new Date(2026, 10, 23, 9, 0).getTime();
    assert.equal(datePrefix(ts), '20261123');
    assert.equal(taskFolderName('BP-KU', 'Grundriss EG', ts), '20261123_BP-KU_Grundriss');
    assert.equal(taskFolderName('BP-KU', 'Grundriss OG', ts, ['20261123_BP-KU_Grundriss']), '20261123_BP-KU_Grundriss-2');
    assert.equal(taskFolderName('BP-KU', 'Grundriss', ts, ['20261123_BP-KU_Grundriss', '20261123_bp-ku_grundriss-2']), '20261123_BP-KU_Grundriss-3');
});

test('files are never overwritten', () => {
    assert.equal(freeFileName('Grundriss.pln', []), 'Grundriss.pln');
    assert.equal(freeFileName('Grundriss.pln', ['grundriss.pln']), 'Grundriss (2).pln');
    assert.equal(freeFileName('Grundriss.pln', ['Grundriss.pln', 'Grundriss (2).pln']), 'Grundriss (3).pln');
    assert.equal(freeFileName('README', ['README']), 'README (2)');
});

test('late submissions are orange', () => {
    const task = { deadline: 1000 };
    assert.equal(submissionState(task, null), 'none');
    assert.equal(submissionState(task, { files: [{}], firstAt: 900 }), 'done');
    assert.equal(submissionState(task, { files: [{}], firstAt: 1100 }), 'late');
    assert.equal(submissionState({}, { files: [{}], firstAt: 1100 }), 'done');
});
