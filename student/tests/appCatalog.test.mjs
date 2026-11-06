// Unit tests for the program-lock matching rules. Run: npm test (in student/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    APP_CATALOG, BUILTIN_TEMPLATES, globToRegExp, matchesEntry, classify, resolveEntries, entryFromRunningApp, processKey,
} from '../../shared/appCatalog.js';

const cad = resolveEntries(BUILTIN_TEMPLATES.find((t) => t.id === 'builtin-cad').allowed);

test('catalog ids are unique and every template references existing entries', () => {
    const ids = APP_CATALOG.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const t of BUILTIN_TEMPLATES) assert.equal(resolveEntries(t.allowed).length, t.allowed.length, t.name);
});

test('glob matching is case-insensitive and anchored', () => {
    assert.ok(globToRegExp('archicad*.exe').test('ARCHICAD.exe'));
    assert.ok(globToRegExp('com.graphisoft.*').test('com.graphisoft.ARCHICAD-64.27.0'));
    assert.ok(!globToRegExp('rhino.exe').test('notrhino.exe'));
    assert.ok(!globToRegExp('acad.exe').test('acad.exe.bak'));
});

test('windows: allowed CAD program by exe name or full path', () => {
    assert.equal(classify({ name: 'ARCHICAD', exe: 'C:\\Program Files\\GRAPHISOFT\\Archicad 27\\ARCHICAD.exe', windowed: true }, cad, 'win32'), 'allowed');
    assert.equal(classify({ name: 'Rhino', exe: 'C:\\Program Files\\Rhino 8\\System\\Rhino.exe', windowed: true }, cad, 'win32'), 'allowed');
});

test('windows: browser and chat are blocked, shell is protected', () => {
    assert.equal(classify({ name: 'chrome', exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', windowed: true }, cad, 'win32'), 'blocked');
    assert.equal(classify({ name: 'WhatsApp', exe: 'C:\\...\\WhatsApp.exe', windowed: true }, cad, 'win32'), 'blocked');
    assert.equal(classify({ name: 'explorer', exe: 'C:\\Windows\\explorer.exe', windowed: true }, cad, 'win32'), 'protected');
    assert.equal(classify({ name: 'Taskmgr', windowed: true }, cad, 'win32'), 'protected');
});

test('windows: background processes are only blocked when on the blocklist', () => {
    assert.equal(classify({ name: 'OneDrive', exe: 'OneDrive.exe', windowed: false }, cad, 'win32'), 'allowed');
    assert.equal(classify({ name: 'Discord', exe: 'Discord.exe', windowed: false }, cad, 'win32'), 'blocked');
    assert.equal(classify({ name: 'ms-teams', exe: 'ms-teams.exe', windowed: false }, cad, 'win32'), 'blocked');
    // Teams explicitly allowed by the teacher -> also allowed in the background
    assert.equal(classify({ name: 'ms-teams', exe: 'ms-teams.exe', windowed: false }, [...cad, ...resolveEntries(['teams'])], 'win32'), 'allowed');
});

test('macOS: bundle id or app name match, system UI protected', () => {
    assert.equal(classify({ name: 'ARCHICAD', bundleId: 'com.graphisoft.ARCHICAD-64.27.0', appName: 'Archicad 27', windowed: true }, cad, 'darwin'), 'allowed');
    assert.equal(classify({ name: 'Rhinoceros', bundleId: 'com.mcneel.rhinoceros.8', appName: 'Rhino 8', windowed: true }, cad, 'darwin'), 'allowed');
    assert.equal(classify({ name: 'Safari', bundleId: 'com.apple.Safari', appName: 'Safari', windowed: true }, cad, 'darwin'), 'blocked');
    assert.equal(classify({ name: 'Finder', bundleId: 'com.apple.finder', appName: 'Finder', windowed: true }, cad, 'darwin'), 'protected');
    assert.equal(classify({ name: 'Electron', bundleId: 'com.nextclass.student', appName: 'Next-Class-Student', windowed: true }, cad, 'darwin'), 'protected');
    assert.equal(classify({ name: 'sociallayerd', bundleId: 'com.apple.sociallayerd', windowed: true, system: true }, cad, 'darwin'), 'protected');
});

test('linux: process name match', () => {
    const gis = resolveEntries(BUILTIN_TEMPLATES.find((t) => t.id === 'builtin-gis').allowed);
    assert.equal(classify({ name: 'qgis', windowed: true }, gis, 'linux'), 'allowed');
    assert.equal(classify({ name: 'firefox', windowed: true }, gis, 'linux'), 'blocked');
    assert.equal(classify({ name: 'gnome-shell', windowed: true }, gis, 'linux'), 'protected');
});

test('custom entry from a running program matches that program on the same platform', () => {
    const winApp = { name: 'Lumion', exe: 'Lumion 2024.exe' };
    const winEntry = entryFromRunningApp(winApp, 'win32');
    assert.ok(matchesEntry({ ...winApp, windowed: true }, winEntry, 'win32'));
    const macApp = { name: 'Twinmotion', bundleId: 'com.epicgames.twinmotion', appName: 'Twinmotion 2024' };
    const macEntry = entryFromRunningApp(macApp, 'darwin');
    assert.ok(matchesEntry({ ...macApp, windowed: true }, macEntry, 'darwin'));
    assert.ok(macEntry.id.startsWith('custom-darwin-'));
});

test('processKey normalizes paths and .exe', () => {
    assert.equal(processKey('C:\\X\\Discord.EXE'), 'discord');
    assert.equal(processKey('/usr/bin/telegram-desktop'), 'telegram-desktop');
});
