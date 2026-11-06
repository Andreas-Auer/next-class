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
import { app, BrowserWindow, dialog } from 'electron';
import log from 'electron-log';
import i18n from '../../../src/locales/locales.js';
import platformDispatcher from './platformDispatcher.js';

const { t } = i18n.global;
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

function devServerUrl() {
    return process.env.APP_URL || `http://${process.env.VITE_DEV_SERVER_HOST || 'localhost'}:${process.env.VITE_DEV_SERVER_PORT || '9300'}`;
}

class WindowHandler {
    constructor() {
        this.mainwindow = null;
        this.multicastClient = null;
        this.config = null;
    }

    init(mc, config) {
        this.multicastClient = mc;
        this.config = config;
    }

    createWindow() {
        this.mainwindow = new BrowserWindow({
            title: 'Next-Class Lehrer',
            backgroundColor: '#2e2c29',
            show: false,
            icon: path.join(platformDispatcher.publicBase, 'icons', 'icon.png'),
            center: true,
            width: 1400,
            height: 860,
            minWidth: 1100,
            minHeight: 700,
            webPreferences: {
                preload: process.env.QUASAR_ELECTRON_PRELOAD_FOLDER
                    ? path.resolve(__dirname, path.join(process.env.QUASAR_ELECTRON_PRELOAD_FOLDER, 'electron-preload' + (process.env.QUASAR_ELECTRON_PRELOAD_EXTENSION || '.cjs')))
                    : path.join(__dirname, '../preload/preload.mjs'),
                spellcheck: false,
            },
        });
        this.mainwindow.removeMenu();

        const reveal = () => {
            if (this.mainwindow && !this.mainwindow.isVisible()) {
                this.mainwindow.show();
                this.mainwindow.moveTop();
            }
        };
        this.mainwindow.webContents.once('did-finish-load', reveal);
        this.mainwindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
            log.warn(`windowhandler @ createWindow: did-fail-load ${code} ${desc} ${url}`);
            reveal();
        });

        if (app.isPackaged || process.env.DEBUG) this.mainwindow.loadFile(getRendererIndexPath());
        else this.mainwindow.loadURL(devServerUrl());

        if (this.config.showdevtools) this.mainwindow.webContents.openDevTools();

        // the renderer only talks to the local teacher API
        this.mainwindow.webContents.session.setCertificateVerifyProc((request, callback) => {
            callback(['localhost', '127.0.0.1', '::1'].includes(request.hostname) ? 0 : -3);
        });

        // never navigate away from the app or open extra windows
        this.mainwindow.webContents.on('will-navigate', (event, url) => {
            if (!app.isPackaged && url.startsWith(devServerUrl())) return;
            event.preventDefault();
        });
        this.mainwindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

        // closing while a session runs: ask first (students get unlocked automatically when the teacher is gone)
        this.mainwindow.on('close', (e) => {
            if (this.mainwindow.allowexit || this.config.development) return;
            if (Object.keys(this.config.examServerList).length === 0) return;
            const choice = dialog.showMessageBoxSync(this.mainwindow, {
                type: 'question',
                buttons: [t('general.quit'), t('general.cancel')],
                defaultId: 1,
                cancelId: 1,
                title: t('general.sessionRunningTitle'),
                message: t('general.sessionRunningText'),
            });
            if (choice !== 0) e.preventDefault();
        });
    }
}

export default new WindowHandler();
