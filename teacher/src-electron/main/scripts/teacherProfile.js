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
 * Profile of the teacher using this app: name and submission folder.
 * Stored only on this device (profile.json in the user data folder) and never synced to other teachers.
 */

import fs from 'fs';
import path from 'path';
import { app, ipcMain, dialog, shell } from 'electron';
import log from 'electron-log';

export const DEFAULT_FOLDER_NAME = 'Next-Class Abgaben';

export function cleanTeacherName(name) {
    return String(name || '').replace(/[^\p{L}\p{N} ._-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

class TeacherProfile {
    constructor() {
        this.data = null;
    }

    file() {
        return process.env.NEXT_CLASS_PROFILE_FILE || path.join(app.getPath('userData'), 'profile.json');
    }

    /** Documents/Next-Class Abgaben (app.getPath follows the OS, including OneDrive-redirected documents on Windows). */
    defaultFolder() {
        return path.join(app.getPath('documents'), DEFAULT_FOLDER_NAME);
    }

    load() {
        if (this.data) return this.data;
        try {
            const parsed = JSON.parse(fs.readFileSync(this.file(), 'utf8'));
            this.data = { name: cleanTeacherName(parsed.name), folder: typeof parsed.folder === 'string' ? parsed.folder : '' };
        } catch {
            this.data = { name: '', folder: '' };
        }
        return this.data;
    }

    save() {
        try {
            fs.mkdirSync(path.dirname(this.file()), { recursive: true });
            fs.writeFileSync(this.file(), JSON.stringify(this.data, null, 2));
        } catch (e) {
            log.error(`teacherProfile @ save: ${e.message}`);
        }
    }

    name() {
        return this.load().name;
    }

    /** The submission folder in use: the chosen one or the default. */
    folder() {
        return this.load().folder || this.defaultFolder();
    }

    view() {
        const d = this.load();
        return { name: d.name, folder: this.folder(), isDefault: !d.folder, defaultFolder: this.defaultFolder() };
    }

    update({ name, folder } = {}) {
        const d = this.load();
        if (name !== undefined) {
            const clean = cleanTeacherName(name);
            if (!clean) return { status: 'error', code: 'MISSING_NAME' };
            d.name = clean;
        }
        if (folder !== undefined) d.folder = folder && path.resolve(folder) !== this.defaultFolder() ? path.resolve(folder) : '';
        this.save();
        return { status: 'success', profile: this.view() };
    }

    /** Create the folder if needed; returns false if it cannot be used (e.g. a disconnected network drive). */
    ensureFolder(folder = this.folder()) {
        try {
            fs.mkdirSync(folder, { recursive: true });
            fs.accessSync(folder, fs.constants.W_OK);
            return true;
        } catch (e) {
            log.warn(`teacherProfile @ ensureFolder: ${folder}: ${e.message}`);
            return false;
        }
    }

    init(getWindow) {
        ipcMain.handle('profile-get', () => this.view());
        ipcMain.handle('profile-set', (_e, data) => this.update(data || {}));
        /** Folder picker; returns the chosen path or null. */
        ipcMain.handle('choose-folder', async (_e, current) => {
            const win = getWindow?.();
            const start = current || this.folder();
            const r = await dialog.showOpenDialog(win, {
                defaultPath: fs.existsSync(start) ? start : app.getPath('documents'),
                properties: ['openDirectory', 'createDirectory'],
            });
            return r.canceled || !r.filePaths?.[0] ? null : r.filePaths[0];
        });
        ipcMain.handle('open-folder', async (_e, folder) => {
            const target = folder || this.folder();
            if (!this.ensureFolder(target)) return { status: 'error' };
            const err = await shell.openPath(target);
            return err ? { status: 'error', message: err } : { status: 'success' };
        });
    }
}

export default new TeacherProfile();
