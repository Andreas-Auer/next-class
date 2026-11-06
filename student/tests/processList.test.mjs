// Platform tests for listing and closing programs. Only harmless child processes are closed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { listRunningApps, closeApp, stopWatchers } from '../src-electron/main/scripts/applock/processList.js';

const unix = process.platform !== 'win32';

function waitForExit(child, ms) {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), ms);
        child.once('exit', (code, signal) => { clearTimeout(timer); resolve(signal || code); });
    });
}

test('closeApp ends a process politely (SIGTERM / WM_CLOSE)', { skip: !unix && 'console process has no window to close politely' }, async () => {
    const child = spawn('sleep', ['60'], { stdio: 'ignore' });
    const exited = waitForExit(child, 5000);
    assert.equal(await closeApp({ pid: child.pid, name: 'sleep' }), true);
    assert.equal(await exited, 'SIGTERM');
});

test('closeApp with force ends a process that ignores the polite request', async () => {
    const child = unix
        ? spawn('sh', ['-c', 'trap "" TERM; sleep 60'], { stdio: 'ignore' })                 // ignores SIGTERM
        : spawn('ping', ['-n', '60', '127.0.0.1'], { stdio: 'ignore' });
    const exited = waitForExit(child, 5000);
    if (unix) {
        await new Promise((r) => setTimeout(r, 300));   // let the shell install its trap first
        await closeApp({ pid: child.pid, name: 'sh' });
        assert.equal(await waitForExit(child, 800), null, 'still running after the polite request');
    }
    assert.equal(await closeApp({ pid: child.pid, name: 'sh' }, { force: true }), true);
    assert.ok(await exited);
});

test('macOS: running apps carry bundle ids and Finder is a windowed app', { skip: process.platform !== 'darwin' }, async () => {
    const apps = await listRunningApps();
    const finder = apps.find((a) => a.bundleId === 'com.apple.finder');
    assert.ok(finder, 'Finder found');
    assert.equal(finder.windowed, true);
    assert.ok(apps.every((a) => Number.isInteger(a.pid)));
    stopWatchers();
});
