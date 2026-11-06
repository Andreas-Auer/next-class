/**
 * @license GPL LICENSE
 * Copyright (c) 2021 Thomas Michael Weissel (Next-Exam)
 * Modifications for Next-Class (c) 2026 Andreas Auer
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
 * Next-Class student app - Electron main process entry.
 */

import fs from 'fs';
import { inspect } from 'util';
import { X509Certificate } from 'node:crypto';
import { app, BrowserWindow, Menu, nativeTheme, session } from 'electron';
import chalk from 'chalk';
import ip from 'ip';
import log from 'electron-log';
import config from '../src/utils/config.js';
import { gateway4sync } from '../../shared/defaultGateway.js';
import platformDispatcher from './main/scripts/platformDispatcher.js';
import multicastClient from './main/scripts/multicastclient.js';
import { resetExamApiConnections } from './main/scripts/examApiFetch.js';
import WindowHandler from './main/scripts/windowhandler.js';
import CommHandler from './main/scripts/communicationhandler.js';
import IpcHandler from './main/scripts/ipchandler.js';
import { updateSystemTray } from './main/scripts/traymenu.js';
import { initErrorHandling } from './main/scripts/errorHandling.js';

// e2e tests run teacher and student on an isolated port
const e2eServerApiPort = Number(process.env.NXE_E2E_SERVER_API_PORT);
if (Number.isInteger(e2eServerApiPort)) config.serverApiPort = e2eServerApiPort;

app.commandLine.appendSwitch('lang', 'de');
app.commandLine.appendSwitch('log-level', '3');
if (process.platform === 'win32') {
    // keep heartbeat/discovery timers running while the window is hidden in the tray
    app.commandLine.appendSwitch('disable-renderer-backgrounding');
    app.commandLine.appendSwitch('disable-background-timer-throttling');
}

// ---- paths -------------------------------------------------------------
config.homedirectory = platformDispatcher.homedirectory;
config.workdirectory = platformDispatcher.workdirectory;
config.tempdirectory = platformDispatcher.tempdirectory;
fs.mkdirSync(config.workdirectory, { recursive: true });

// ---- logging -----------------------------------------------------------
log.initialize();
log.eventLogger.startLogging();
log.errorHandler.startCatching();
log.transports.file.resolvePathFn = () => platformDispatcher.logfile;
const formatLogData = (data) => (Array.isArray(data) ? data : [data])
    .map((part) => (typeof part === 'object' && part !== null ? inspect(part, { depth: 2, breakLength: Infinity }) : String(part)))
    .join(' ');
log.transports.console.format = (message) => {
    const colors = { info: chalk.green, warn: chalk.yellow, error: chalk.red, debug: chalk.blue, verbose: chalk.magenta };
    const color = colors[message.level] || ((s) => s);
    return [color(formatLogData(message.data))];
};
log.verbose(`main: starting Next-Class Student "${config.version} ${config.info}" (${process.platform})${config.development ? ' (devmode on)' : ''}`);
log.info(`main: logfile at ${platformDispatcher.logfile}`);
log.debug(`main: Electron ${process.versions.electron}, OS ${process.platform} ${process.getSystemVersion()} ${process.arch}, display ${platformDispatcher.displayServer}`);

// ---- single instance ---------------------------------------------------
if (!app.requestSingleInstanceLock()) {
    log.warn('main: Next-Class student already running');
    app.quit();
    process.exit(0);
}
app.on('second-instance', () => WindowHandler.showFromTray());

// ---- network -----------------------------------------------------------
try {
    const { int: iface } = gateway4sync();
    config.hostip = ip.address(iface);   // ip of the interface that owns the default gateway
    config.gateway = true;
} catch {
    log.error('main: unable to determine default gateway');
    config.hostip = ip.address();
    config.gateway = false;
}
if (config.hostip === '127.0.0.1') config.hostip = false;

WindowHandler.init(multicastClient, config);
CommHandler.init(multicastClient, config);
IpcHandler.init(multicastClient, config, WindowHandler, CommHandler);
initErrorHandling(log, WindowHandler);
Menu.setApplicationMenu(null);
if (process.platform === 'win32') app.setAppUserModelId(app.getName());

/** Chromium-side certificate check: accept only the pinned teacher certificate. */
function installTeacherCertificateVerifier() {
    session.defaultSession.setCertificateVerifyProc((request, callback) => {
        let fingerprint = request.certificate?.fingerprint;
        try { fingerprint = new X509Certificate(request.certificate.data).fingerprint256; } catch { /* keep electron fingerprint */ }
        callback(multicastClient.isTeacherCertificateAllowed(request.hostname, fingerprint) ? 0 : -3);
    });
}

// report "app closed" to the teacher before quitting (one short request, then quit for real)
let quitReported = false;
app.on('before-quit', (event) => {
    if (quitReported || !multicastClient.clientinfo.token) return;
    event.preventDefault();
    quitReported = true;
    Promise.resolve(IpcHandler.notifyQuit?.()).finally(() => app.quit());
});

app.on('window-all-closed', () => {
    CommHandler.stop();
    multicastClient.refreshExamsScheduler?.stop?.();
    app.quit();
});

app.on('activate', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.focus();
    else WindowHandler.createMainWindow();
});

app.whenReady().then(async () => {
    nativeTheme.themeSource = 'light';
    session.defaultSession.setUserAgent(`Next-Class/${config.version} (${config.info}) ${process.platform}`);
    installTeacherCertificateVerifier();
    multicastClient.onTeacherCertificateAccepted = async () => {
        installTeacherCertificateVerifier();
        resetExamApiConnections();   // drop pooled TLS sockets pinned to the previous certificate
        await session.defaultSession.closeAllConnections();
    };

    await WindowHandler.createMainWindow();
    if (config.hostip) multicastClient.init(config.gateway);

    if (!config.development && !platformDispatcher.isGNOME) updateSystemTray('de');   // GNOME hides legacy tray icons

    if (config.development) {
        const win = WindowHandler.mainwindow;
        win?.webContents.on('before-input-event', (event, input) => {
            const mod = process.platform === 'darwin' ? input.meta : input.control;
            if (input.type === 'keyDown' && mod && input.shift && input.key.toLowerCase() === 't') {
                event.preventDefault();
                win.webContents.toggleDevTools();
            }
        });
    }
});
