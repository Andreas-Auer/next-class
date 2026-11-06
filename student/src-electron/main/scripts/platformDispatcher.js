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
import os from 'os';
import path from 'path';
import { app } from 'electron';
import config from '../../../src/utils/config.js';

const __dirname = import.meta.dirname;

/** Platform facts and well-known paths, resolved once at startup. */
class PlatformDispatcher {
    constructor() {
        this.platform = process.platform;
        this.messages = [];
        this.displayServer = this._getDisplayServer();
        this.desktopName = this._getDesktopName();
        this.isGNOME = this.desktopName.includes('gnome');
        this.publicBase = this._getPublicBase();
        this.homedirectory = os.homedir();
        this.workdirectory = path.join(this.homedirectory, config.clientdirectory);
        this.tempdirectory = path.join(os.tmpdir(), 'next-class-student-tmp');
        this.logfile = path.join(this.workdirectory, 'next-class-student.log');
    }

    _getPublicBase() {
        if (app.isPackaged) {
            const unpacked = path.join(process.resourcesPath, 'app.asar.unpacked');
            const withPublic = path.join(unpacked, 'public');
            return fs.existsSync(withPublic) ? withPublic : unpacked;
        }
        // unpackaged build: assets next to the bundled main (dist/electron/UnPackaged/public); dev: project public/
        const bundled = path.join(__dirname, 'public');
        return fs.existsSync(path.join(bundled, 'icons')) ? bundled : path.join(__dirname, '../../public');
    }

    _getDisplayServer() {
        if (this.platform === 'win32') return 'windows';
        if (this.platform === 'darwin') return 'quartz';
        if (process.env.XDG_SESSION_TYPE === 'wayland') return 'wayland';
        if (process.env.XDG_SESSION_TYPE === 'x11' || process.env.DISPLAY) return 'x11';
        return 'unknown';
    }

    _getDesktopName() {
        if (this.platform === 'win32') return 'explorer';
        if (this.platform === 'darwin') return 'aqua';
        return String(process.env.XDG_CURRENT_DESKTOP || 'unknown').toLowerCase();
    }
}

const platformDispatcher = new PlatformDispatcher();
export default platformDispatcher;
