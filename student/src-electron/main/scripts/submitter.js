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
 * Hand in files for a task: each file is sent to the teacher app leading the lesson (school network only,
 * so this also works while the internet is locked). The teacher app checks size and SHA-256 and confirms.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import log from 'electron-log';
import { examApiFetch } from './examApiFetch.js';
import { safeName, freeFileName } from '../../../../shared/submissionRules.js';

const MAX_TRIES = 3;

async function sha256Of(file) {
    const hash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
}

/**
 * @param url      https://teacher:port/server/control/submit/<servername>/<taskId>
 * @param headers  bearer token of this student
 * @param files    absolute paths
 * @param progress (state) => void   { index, total, name, done, error? }
 * @returns { status, files: [{ name, size, at }], failed: [{ name, code }] }
 */
export async function submitFiles(url, headers, files, progress = () => {}) {
    const stored = [];
    const failed = [];
    for (const [index, file] of files.entries()) {
        const name = path.basename(file);
        let stat;
        try { stat = fs.statSync(file); } catch { failed.push({ name, code: 'NOT_FOUND' }); continue; }
        if (!stat.isFile()) { failed.push({ name, code: 'NOT_A_FILE' }); continue; }
        progress({ index, total: files.length, name, done: false });
        const sha256 = await sha256Of(file);
        let result = null;
        for (let attempt = 1; attempt <= MAX_TRIES && !(result?.status === 'success'); attempt++) {
            try {
                const response = await examApiFetch(url, {
                    method: 'POST',
                    headers: {
                        ...headers,
                        'Content-Type': 'application/octet-stream',
                        'X-File-Name': encodeURIComponent(name),
                        'X-File-Size': String(stat.size),
                        'X-File-Sha256': sha256,
                    },
                    body: Readable.toWeb(fs.createReadStream(file)),
                    duplex: 'half',
                });
                result = await response.json();
            } catch (e) {
                result = { status: 'error', code: 'NETWORK', message: e.message };
            }
            // only an incomplete transfer is worth trying again
            if (result?.status !== 'success' && !['INCOMPLETE', 'NETWORK'].includes(result?.code)) break;
        }
        if (result?.status === 'success') stored.push(result.file);
        else failed.push({ name, code: result?.code || 'NETWORK' });
        progress({ index, total: files.length, name, done: true, error: result?.status === 'success' ? null : result?.code });
        log.info(`submitter: ${name} -> ${result?.status === 'success' ? 'stored' : result?.code}`);
    }
    return { status: failed.length ? (stored.length ? 'partial' : 'error') : 'success', files: stored, failed };
}

/**
 * Material of a task (sent by the teacher): saved to Downloads/Next-Class/<task folder>/<file>.
 * An existing file with the same name is kept ("Angabe (2).pdf").
 */
export async function downloadMaterial(url, headers, downloadsDir, task, material) {
    const dir = path.join(downloadsDir, 'Next-Class', safeName(task.folderName, 'Aufgabe'));
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, freeFileName(material.name, fs.readdirSync(dir)));
    const response = await examApiFetch(url, { method: 'GET', headers });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    const tmp = `${target}.download`;
    const hash = crypto.createHash('sha256');
    const out = fs.createWriteStream(tmp);
    try {
        for await (const chunk of Readable.fromWeb(response.body)) {
            hash.update(chunk);
            if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
        }
        await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
    } catch (e) {
        out.destroy();
        fs.rmSync(tmp, { force: true });
        throw e;
    }
    if (material.sha256 && hash.digest('hex') !== material.sha256) { fs.rmSync(tmp, { force: true }); throw new Error('checksum'); }
    fs.renameSync(tmp, target);
    log.info(`submitter: material ${material.name} -> ${target}`);
    return target;
}
