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

// Renderer-side logging: electron-log forwards to the main process log file.
import electronLog from 'electron-log'

const loggingBridge = {
    error: (...m) => electronLog.error(...m),
    warn: (...m) => electronLog.warn(...m),
    info: (...m) => electronLog.info(...m),
    log: (...m) => electronLog.log(...m),
    debug: (...m) => electronLog.debug(...m),
}

export default loggingBridge
