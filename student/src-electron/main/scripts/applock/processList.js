/**
 * @license GPL LICENSE
 * Copyright (c) 2026 Andreas Auer (Next-Class, fork of Next-Exam)
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free Software Foundation,
 * either version 3 of the License, or any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <http://www.gnu.org/licenses/>
 */

/**
 * Lists running programs and closes them - per platform, without admin rights
 * (a user may always end his own processes).
 *
 * Result entries: { pid, name, exe?, bundleId?, appName?, windowed }
 *   windowed = true  -> a program with a window / Dock icon (subject to the allowlist)
 *   windowed = false -> background process (only checked against the background blocklist)
 */

import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import log from 'electron-log';
import { BACKGROUND_BLOCKLIST } from '../../../../../shared/appCatalog.js';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------- macOS

const plistCache = new Map();   // bundle path -> { bundleId, appName, background }

/** Read the relevant Info.plist keys of an .app bundle (plutil handles binary plists). */
async function readBundleInfo(bundlePath) {
    if (plistCache.has(bundlePath)) return plistCache.get(bundlePath);
    let info = { bundleId: null, appName: path.basename(bundlePath, '.app'), background: false };
    try {
        const { stdout } = await execFileAsync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(bundlePath, 'Contents', 'Info.plist')], { maxBuffer: 4 * 1024 * 1024 });
        const plist = JSON.parse(stdout);
        const truthy = (v) => v === true || v === 1 || v === '1' || v === 'YES' || v === 'true';
        info = {
            bundleId: plist.CFBundleIdentifier || null,
            appName: path.basename(bundlePath, '.app'),
            // menu-bar agents (OneDrive, Dropbox, ...) and background-only apps have no Dock icon
            background: truthy(plist.LSUIElement) || truthy(plist.LSBackgroundOnly),
        };
    } catch {
        // unreadable plist: treat as a normal app identified by its name
    }
    plistCache.set(bundlePath, info);
    return info;
}

async function listMac() {
    const { stdout } = await execFileAsync('/bin/ps', ['-axo', 'pid=,comm='], { maxBuffer: 8 * 1024 * 1024 });
    const result = [];
    const seenBundles = new Set();
    for (const line of stdout.split('\n')) {
        const m = /^\s*(\d+)\s+(.+)$/.exec(line);
        if (!m) continue;
        const pid = Number(m[1]);
        const exePath = m[2].trim();
        // main executable of an app: <...>/Name.app/Contents/MacOS/<exe> (outermost bundle; helpers live deeper)
        const bm = /^(.*?\.app)\/Contents\/MacOS\/[^/]+$/.exec(exePath);
        if (bm) {
            const bundlePath = bm[1];
            if (seenBundles.has(bundlePath)) continue;
            seenBundles.add(bundlePath);
            const info = await readBundleInfo(bundlePath);
            // macOS itself (agents, daemons, system UI); user-facing Apple apps live in /System/Applications or a Cryptex
            const system = /^\/(System\/Library|Library\/Apple|usr)\//.test(bundlePath);
            result.push({ pid, name: path.basename(exePath), exe: exePath, bundleId: info.bundleId, appName: info.appName, windowed: !info.background, system });
        } else {
            const name = path.basename(exePath);
            if (BACKGROUND_BLOCKLIST.includes(name.toLowerCase())) result.push({ pid, name, exe: exePath, windowed: false });
        }
    }
    return result;
}

// ---------------------------------------------------------------------------- Windows

/**
 * One long-running PowerShell prints a JSON snapshot every 2 s (starting PowerShell per poll would cost
 * ~0.3 s CPU each time). Windowed = has a main window handle.
 */
let winProc = null;
let winSnapshot = [];
let winBuffer = '';

function startWindowsWatcher() {
    if (winProc) return;
    const block = BACKGROUND_BLOCKLIST.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');
    const script = `
$ErrorActionPreference = 'SilentlyContinue'
$block = @(${block})
while ($true) {
  $list = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -or $block -contains $_.ProcessName.ToLower() } |
    ForEach-Object { [pscustomobject]@{ pid = $_.Id; name = $_.ProcessName; exe = $_.Path; title = $_.MainWindowTitle; windowed = ($_.MainWindowHandle -ne 0) } }
  Write-Output ("NCSNAP " + (ConvertTo-Json -InputObject @($list) -Compress))
  Start-Sleep -Seconds 2
}`;
    winProc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'], { windowsHide: true });
    winProc.stdin.write(script);
    winProc.stdin.end();
    winProc.stdout.on('data', (chunk) => {
        winBuffer += chunk.toString();
        let idx;
        while ((idx = winBuffer.indexOf('\n')) >= 0) {
            const line = winBuffer.slice(0, idx).trim();
            winBuffer = winBuffer.slice(idx + 1);
            if (!line.startsWith('NCSNAP ')) continue;
            try {
                const parsed = JSON.parse(line.slice(7));
                winSnapshot = (Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean)
                    .map((p) => ({ pid: p.pid, name: p.name, exe: p.exe || `${p.name}.exe`, title: p.title, windowed: !!p.windowed }));
            } catch (e) {
                log.warn(`processList @ windows: could not parse snapshot: ${e.message}`);
            }
        }
    });
    winProc.on('exit', (code) => {
        log.warn(`processList @ windows: watcher exited (${code}), restarting with the next poll`);
        winProc = null;
    });
}

async function listWindows() {
    startWindowsWatcher();
    return winSnapshot;
}

// ---------------------------------------------------------------------------- Linux

let wmctrlAvailable = null;

async function listLinux() {
    const { stdout } = await execFileAsync('ps', ['-eo', 'pid=,comm='], { maxBuffer: 8 * 1024 * 1024 });
    const procs = stdout.split('\n').map((l) => /^\s*(\d+)\s+(.+)$/.exec(l)).filter(Boolean).map((m) => ({ pid: Number(m[1]), name: m[2].trim() }));

    // windowed processes via wmctrl (X11 / XWayland only); native Wayland offers no global window list
    let windowedPids = new Set();
    if (wmctrlAvailable !== false) {
        try {
            const { stdout: wm } = await execFileAsync('wmctrl', ['-lp']);
            windowedPids = new Set(wm.split('\n').map((l) => Number(l.trim().split(/\s+/)[2])).filter((n) => n > 0));
            wmctrlAvailable = true;
        } catch {
            if (wmctrlAvailable === null) log.warn('processList @ linux: wmctrl not available - only the background blocklist is enforced');
            wmctrlAvailable = false;
        }
    }
    return procs
        .map((p) => ({ ...p, windowed: windowedPids.has(p.pid) }))
        .filter((p) => p.windowed || BACKGROUND_BLOCKLIST.includes(p.name.toLowerCase()));
}

// ---------------------------------------------------------------------------- public API

/** Running programs relevant for the program lock. */
export async function listRunningApps() {
    if (process.platform === 'darwin') return listMac();
    if (process.platform === 'win32') return listWindows();
    return listLinux();
}

/** True when the platform can enforce the allowlist for windowed programs. */
export function allowlistSupported() {
    return process.platform !== 'linux' || wmctrlAvailable !== false;
}

/**
 * Ask a program to quit (graceful = it may still show "save changes?"), or end it hard.
 * Windows: taskkill without /F sends WM_CLOSE. macOS/Linux: SIGTERM, then SIGKILL.
 */
export async function closeApp(proc, { force = false } = {}) {
    try {
        if (process.platform === 'win32') {
            await execFileAsync('taskkill', force ? ['/F', '/T', '/PID', String(proc.pid)] : ['/PID', String(proc.pid)], { windowsHide: true });
        } else {
            process.kill(proc.pid, force ? 'SIGKILL' : 'SIGTERM');
        }
        return true;
    } catch (e) {
        log.warn(`processList @ closeApp: ${proc.name} (${proc.pid}): ${e.message}`);
        return false;
    }
}

export function stopWatchers() {
    try { winProc?.kill(); } catch { /* already gone */ }
    winProc = null;
}
