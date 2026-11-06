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

import fs from 'fs';
import path from 'path';
import { app, BrowserWindow, dialog, screen } from 'electron';
import log from 'electron-log';
import platformDispatcher from './platformDispatcher.js';

const __dirname = import.meta.dirname;

/** Renderer index.html: packaged app uses app.asar.unpacked/public, dev builds the local dist. */
function getRendererIndexPath() {
    const candidates = [
        app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked', 'public', 'index.html') : null,
        path.join(__dirname, 'public', 'index.html'),
        path.join(__dirname, 'index.html'),
    ].filter(Boolean);
    return candidates.find((p) => fs.existsSync(p)) || candidates[candidates.length - 1];
}

/** Load a hash route into a window (file:// when packaged or in e2e, Vite dev server otherwise). */
function loadRoute(win, route = '') {
    if (app.isPackaged || process.env.DEBUG) {
        return win.loadFile(getRendererIndexPath(), route ? { hash: `#/${route}/` } : undefined);
    }
    return win.loadURL(route ? `${process.env.APP_URL}/#/${route}/` : `${process.env.APP_URL}`);
}

/**
 * Student windows: one normal main window (students keep working in their own programs)
 * plus one full-screen lock window per display while the teacher has locked the screens.
 */
class WindowHandler {
    constructor() {
        this.mainwindow = null;
        this.screenlockwindows = [];
        this.multicastClient = null;
        this.config = null;
    }

    init(mc, config) {
        this.multicastClient = mc;
        this.config = config;
    }

    mainWin() {
        return this.mainwindow && !this.mainwindow.isDestroyed() ? this.mainwindow : null;
    }

    hideToTray() {
        this.mainWin()?.hide();
    }

    showFromTray() {
        const win = this.mainWin();
        if (!win) return;
        win.show();
        if (win.isMinimized()) win.restore();
        win.focus();
    }

    async createMainWindow() {
        const display = screen.getPrimaryDisplay() || screen.getAllDisplays()[0];
        const width = 900;
        const height = 640;
        const x = display ? display.bounds.x + Math.floor((display.bounds.width - width) / 2) : undefined;
        const y = display ? display.bounds.y + Math.floor((display.bounds.height - height) / 2) : undefined;

        this.mainwindow = new BrowserWindow({
            title: 'Next-Class Schüler',
            icon: path.join(platformDispatcher.publicBase, 'icons', 'icon.png'),
            x, y, width, height,
            minWidth: 760,
            minHeight: 560,
            show: false,   // reveal after did-finish-load (Vite cold compile can take a while)
            webPreferences: {
                preload: path.resolve(
                    __dirname,
                    path.join(process.env.QUASAR_ELECTRON_PRELOAD_FOLDER, 'electron-preload' + process.env.QUASAR_ELECTRON_PRELOAD_EXTENSION)
                ),
                spellcheck: false,
                backgroundThrottling: false,  // keep discovery polling alive while the window is hidden
            },
        });
        this.mainwindow.removeMenu();

        // While connected, closing the window only hides it to the tray so the session keeps running.
        this.mainwindow.on('close', async (e) => {
            if (this.mainwindow.allowexit || this.config.development) return;
            if (!this.multicastClient?.clientinfo?.token) return;
            if (platformDispatcher.isGNOME) return;   // GNOME has no legacy tray: quit instead
            e.preventDefault();
            this.hideToTray();
            if (!this.trayHintShown) {
                this.trayHintShown = true;
                dialog.showMessageBox({
                    type: 'info',
                    buttons: ['OK'],
                    title: 'Next-Class',
                    message: 'Next-Class läuft im Hintergrund weiter (Symbol in der Taskleiste bzw. Menüleiste).',
                }).catch(() => {});
            }
        });

        if (this.config.showdevtools) this.mainwindow.webContents.openDevTools();

        const reveal = () => {
            const win = this.mainWin();
            if (!win) return;
            win.show();
            win.focus();
        };
        this.mainwindow.webContents.once('did-finish-load', reveal);
        this.mainwindow.webContents.once('did-fail-load', reveal);

        log.info('windowhandler @ createMainWindow: loading renderer');
        await loadRoute(this.mainwindow);
    }

    /** Full-screen, always-on-top lock window on one display (teacher "Bildschirme sperren"). */
    createScreenlockWindow(display) {
        const lockWin = new BrowserWindow({
            show: false,
            x: display.bounds.x,
            y: display.bounds.y,
            width: display.bounds.width,
            height: display.bounds.height,
            title: 'Next-Class Sperre',
            skipTaskbar: true,
            closable: false,
            minimizable: false,
            movable: false,
            frame: false,
            alwaysOnTop: true,
            icon: path.join(platformDispatcher.publicBase, 'icons', 'icon.png'),
            webPreferences: {
                preload: path.resolve(
                    __dirname,
                    path.join(process.env.QUASAR_ELECTRON_PRELOAD_FOLDER, 'electron-preload' + process.env.QUASAR_ELECTRON_PRELOAD_EXTENSION)
                ),
            },
        });
        this.screenlockwindows.push(lockWin);

        lockWin.webContents.once('did-finish-load', () => {
            if (lockWin.isDestroyed()) return;
            lockWin.removeMenu();
            if (process.platform === 'darwin') lockWin.setSimpleFullScreen(true);
            else lockWin.setFullScreen(true);
            lockWin.setAlwaysOnTop(true, 'screen-saver', 1);
            lockWin.setVisibleOnAllWorkspaces(true);
            lockWin.show();
            lockWin.moveTop();
            // keep the lock window in front - but only refocus this window, never its siblings (multi-display blur loop)
            lockWin.on('blur', () => {
                if (lockWin.isDestroyed() || lockWin.isFocused()) return;
                lockWin.show();
                lockWin.moveTop();
                lockWin.focus();
            });
        });
        lockWin.on('close', (e) => { if (!lockWin.allowclose && !this.config.development) e.preventDefault(); });
        lockWin.on('closed', () => {
            this.screenlockwindows = this.screenlockwindows.filter((w) => w !== lockWin && !w.isDestroyed());
        });

        loadRoute(lockWin, 'lock');
    }

    showScreenlock() {
        if (this.screenlockwindows.length > 0) return;
        for (const display of screen.getAllDisplays()) this.createScreenlockWindow(display);
    }

    removeScreenlock() {
        for (const lockWin of this.screenlockwindows) {
            if (!lockWin || lockWin.isDestroyed()) continue;
            lockWin.removeAllListeners('blur');
            lockWin.allowclose = true;
            lockWin.destroy();
        }
        this.screenlockwindows = [];
    }
}

export default new WindowHandler();
