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
 * Client for the privileged Next-Class helper (helper/ in the repository, written in Go).
 * The helper listens on 127.0.0.1:22533; the shared token is in a file readable by local users.
 */

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { app } from 'electron';
import log from 'electron-log';

const execFileAsync = promisify(execFile);

const HELPER_ADDR = process.env.NEXT_CLASS_HELPER_ADDR || '127.0.0.1:22533';

/** Same locations as helper/internal/install/install.go */
export function tokenFilePath() {
    if (process.env.NEXT_CLASS_HELPER_TOKEN_FILE) return process.env.NEXT_CLASS_HELPER_TOKEN_FILE;
    if (process.platform === 'win32') return path.join(process.env.ProgramData || 'C:\\ProgramData', 'NextClass', 'helper-token');
    if (process.platform === 'darwin') return '/Library/Application Support/NextClass/helper-token';
    return '/etc/nextclass/helper-token';
}

function readToken() {
    try {
        return fs.readFileSync(tokenFilePath(), 'utf8').trim();
    } catch {
        return null;
    }
}

/** Is the helper installed (token file present)? */
export function isInstalled() {
    return !!readToken();
}

async function request(method, route, body) {
    const token = readToken();
    if (!token) throw Object.assign(new Error('helper not installed'), { code: 'NOT_INSTALLED' });
    let response;
    try {
        response = await fetch(`http://${HELPER_ADDR}${route}`, {
            method,
            headers: { 'Content-Type': 'application/json', 'X-NextClass-Token': token },
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(4000),
        });
    } catch (e) {
        throw Object.assign(new Error(`helper not reachable: ${e.message}`), { code: 'UNREACHABLE' });
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || `helper error ${response.status}`), { code: 'HELPER_ERROR' });
    return data;
}

export const helperStatus = () => request('GET', '/v1/status');
export const helperLock = (lockRequest) => request('POST', '/v1/lock', lockRequest);
export const helperUnlock = (reason = 'teacher') => request('POST', `/v1/unlock?reason=${encodeURIComponent(reason)}`);

/** Path of the helper binary shipped with the app (or built locally for development). */
export function bundledHelperPath() {
    const exe = process.platform === 'win32' ? 'nextclass-helper.exe' : 'nextclass-helper';
    if (app.isPackaged) return path.join(process.resourcesPath, 'helper', exe);
    const goos = process.platform === 'win32' ? 'windows' : process.platform;
    const goarch = process.arch === 'x64' ? 'amd64' : process.arch;
    return path.resolve(process.cwd(), '..', 'helper', 'dist', `${goos}-${goarch}`, exe);
}

/**
 * Install the helper as a system service. Shows the operating system's admin prompt once
 * (Windows UAC, macOS password dialog, Linux pkexec). Resolves when installation finished.
 */
export async function installHelper() {
    const bin = bundledHelperPath();
    if (!fs.existsSync(bin)) throw new Error(`helper binary missing: ${bin}`);
    log.info(`helperClient @ installHelper: installing ${bin}`);
    if (process.platform === 'win32') {
        const ps = `$p = Start-Process -FilePath '${bin.replace(/'/g, "''")}' -ArgumentList 'install' -Verb RunAs -Wait -PassThru -WindowStyle Hidden; exit $p.ExitCode`;
        await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 180000 });
    } else if (process.platform === 'darwin') {
        const quoted = bin.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const script = `do shell script "\\"${quoted}\\" install" with administrator privileges with prompt "Next-Class richtet einmalig die Internetsperre für den Unterricht ein."`;
        await execFileAsync('/usr/bin/osascript', ['-e', script], { timeout: 180000 });
    } else {
        await execFileAsync('pkexec', [bin, 'install'], { timeout: 180000 });
    }
    // the service needs a moment to start listening
    for (let i = 0; i < 20; i++) {
        try { await helperStatus(); return true; } catch { await new Promise((r) => setTimeout(r, 500)); }
    }
    throw new Error('helper installed but not reachable');
}
