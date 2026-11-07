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
 * Material of a task (files the teacher hands out, e.g. the assignment as PDF or a template).
 * Copies are kept in the app's user data folder (materials/<id>) only while the app runs a lesson
 * with that task; every teacher app of the lesson keeps a copy so a takeover keeps the material.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { app } from 'electron';
import log from 'electron-log';
import { safeName } from '../../../../shared/submissionRules.js';

const MAX_MATERIAL_BYTES = 500 * 1024 * 1024;

class Materials {
    dir() {
        return process.env.NEXT_CLASS_MATERIALS_DIR || path.join(app.getPath('userData'), 'materials');
    }

    pathOf(id) {
        if (!/^[0-9a-f-]{36}$/.test(String(id))) return null;
        const p = path.join(this.dir(), id);
        return fs.existsSync(p) ? p : null;
    }

    /** Store a stream as material with the given id (or a new one). */
    async store(stream, { name, size, sha256 }, id = crypto.randomUUID()) {
        if (!Number.isFinite(size) || size < 0 || size > MAX_MATERIAL_BYTES) return { status: 'error', code: 'TOO_LARGE' };
        fs.mkdirSync(this.dir(), { recursive: true });
        const target = path.join(this.dir(), id);
        const tmp = `${target}.part`;
        const hash = crypto.createHash('sha256');
        let received = 0;
        try {
            await pipeline(stream, async function* (source) {
                for await (const chunk of source) {
                    received += chunk.length;
                    if (received > size) throw new Error('size');
                    hash.update(chunk);
                    yield chunk;
                }
            }, fs.createWriteStream(tmp));
        } catch {
            fs.rmSync(tmp, { force: true });
            return { status: 'error', code: 'INCOMPLETE' };
        }
        const digest = hash.digest('hex');
        if (received !== size || (sha256 && sha256 !== digest)) { fs.rmSync(tmp, { force: true }); return { status: 'error', code: 'INCOMPLETE' }; }
        fs.renameSync(tmp, target);
        return { status: 'success', material: { id, name: safeName(name, 'Material'), size, sha256: digest } };
    }

    /** Material uploaded to the teacher app leading the lesson (by itself or another teacher). */
    async receive(task, stream, meta) {
        if ((task.materials || []).length >= 20) return { status: 'error', code: 'TOO_MANY' };
        const r = await this.store(stream, meta);
        if (r.status === 'success') task.materials = [...(task.materials || []), r.material];
        return r;
    }

    /** Material picked on this device (file dialog). */
    async addLocal(task, file) {
        const stat = fs.statSync(file);
        return this.receive(task, fs.createReadStream(file), { name: path.basename(file), size: stat.size });
    }

    /** Copy from the teacher app leading the lesson (same id). */
    async storeCopy(material, stream) {
        if (this.pathOf(material.id)) return true;
        const r = await this.store(stream, material, material.id);
        return r.status === 'success';
    }

    /** Remove the copies of the materials of a lesson that ended. */
    removeAll(tasks) {
        for (const m of (tasks || []).flatMap((t) => t.materials || [])) {
            try { fs.rmSync(path.join(this.dir(), m.id), { force: true }); } catch (e) { log.warn(`materials @ removeAll: ${e.message}`); }
        }
    }
}

export default new Materials();
