// Real program-lock test: starts harmless programs, checks that the program lock sees them as
// blocked and closes them - with the real process list of this OS (Windows, macOS, Linux/X11).
// It closes programs, so it only runs with NC_REAL_APPLOCK=1 - in CI on throw-away runners.
//
//   windowed program (Notepad / TextEdit / xterm)  -> listed as windowed, blocked, closed politely
//   background program named "discord"            -> listed as background, blocked, ended hard
//   allowed program                                -> not blocked
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listRunningApps, closeApp, stopWatchers, allowlistSupported } from '../../src-electron/main/scripts/applock/processList.js';
import { classify, entryFromRunningApp } from '../../../shared/appCatalog.js';

const enabled = process.env.NC_REAL_APPLOCK === '1';
const platform = process.platform;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

after(() => stopWatchers());

/** Poll the real process list until match() finds an entry (or give up). */
async function waitFor(match, ms = 30000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        const found = (await listRunningApps()).find(match);
        if (found) return found;
        await sleep(1000);
    }
    return null;
}

async function waitGone(pid, ms = 15000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (!(await listRunningApps()).some((p) => p.pid === pid)) {
            try { process.kill(pid, 0); } catch { return true; }   // really gone, not only out of the list
        }
        await sleep(1000);
    }
    return false;
}

const windowedApp = {
    win32: { start: () => spawn('notepad.exe', [], { detached: true, stdio: 'ignore' }), match: (p) => p.windowed && /^notepad$/i.test(p.name) },
    darwin: { start: () => spawn('/usr/bin/open', ['-n', '-a', 'TextEdit']), match: (p) => p.windowed && p.bundleId === 'com.apple.TextEdit' },
    linux: { start: () => spawn('xterm', [], { detached: true, stdio: 'ignore' }), match: (p) => p.windowed && p.name === 'xterm' },
}[platform];

test('windowed program: listed, blocked, allowed when on the list, closed politely', { skip: !enabled && 'set NC_REAL_APPLOCK=1 (throw-away machine only)' }, async () => {
    assert.ok(allowlistSupported() || platform !== 'linux', 'wmctrl missing');
    // only an instance started by this test counts (never touch a program that was already open)
    const before = new Set((await listRunningApps()).map((p) => p.pid));
    windowedApp.start().unref?.();
    const proc = await waitFor((p) => !before.has(p.pid) && windowedApp.match(p));
    assert.ok(proc, 'started program not found in the process list');
    console.log('found', JSON.stringify(proc));

    assert.equal(classify(proc, [], platform), 'blocked');
    // teacher takes it over from the running programs -> allowed
    const entry = entryFromRunningApp(proc, platform);
    assert.equal(classify(proc, [entry], platform), 'allowed');

    assert.equal(await closeApp(proc), true);
    if (!(await waitGone(proc.pid))) {
        await closeApp(proc, { force: true });   // what the lock does after 10 s
        assert.fail('program did not close politely');
    }
});

test('background program on the blocklist: listed, blocked, ended hard', { skip: !enabled && 'set NC_REAL_APPLOCK=1 (throw-away machine only)' }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-applock-'));
    const exe = path.join(dir, platform === 'win32' ? 'discord.exe' : 'discord');
    fs.copyFileSync(process.execPath, exe);
    if (platform !== 'win32') fs.chmodSync(exe, 0o755);
    if (platform === 'darwin') execFileSync('/usr/bin/codesign', ['--force', '-s', '-', exe]);   // copied binaries need a signature
    const child = spawn(exe, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore', windowsHide: true });
    try {
        const proc = await waitFor((p) => p.pid === child.pid);
        assert.ok(proc, 'background "discord" not found in the process list');
        console.log('found', JSON.stringify(proc));
        assert.equal(proc.windowed, false);
        assert.equal(classify(proc, [], platform), 'blocked');
        assert.equal(await closeApp(proc, { force: true }), true);
        assert.ok(await waitGone(proc.pid), 'background program still running');
    } finally {
        try { child.kill('SIGKILL'); } catch { /* gone */ }
        await sleep(500);
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
