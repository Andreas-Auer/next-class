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
 * Program-lock templates and custom programs of this teacher, stored as JSON in the app's user data
 * folder (e.g. ~/Library/Application Support/next-class-teacher/applock.json). Contains no student data.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { app } from 'electron';
import log from 'electron-log';
import { APP_CATALOG, BUILTIN_TEMPLATES } from '../../../../shared/appCatalog.js';

const EMPTY = { templates: [], customEntries: [] };

class AppLockStore {
    constructor() {
        this.data = null;
    }

    file() {
        return process.env.NEXT_CLASS_APPLOCK_FILE || path.join(app.getPath('userData'), 'applock.json');
    }

    load() {
        if (this.data) return this.data;
        try {
            const parsed = JSON.parse(fs.readFileSync(this.file(), 'utf8'));
            this.data = { templates: parsed.templates || [], customEntries: parsed.customEntries || [] };
        } catch {
            this.data = structuredClone(EMPTY);
        }
        return this.data;
    }

    save() {
        try {
            fs.mkdirSync(path.dirname(this.file()), { recursive: true });
            fs.writeFileSync(this.file(), JSON.stringify(this.data, null, 2));
        } catch (e) {
            log.error(`applockStore @ save: ${e.message}`);
        }
    }

    /** Everything the dashboard needs: catalog, templates (built-in first), custom programs. */
    overview() {
        const data = this.load();
        return {
            catalog: APP_CATALOG,
            customEntries: data.customEntries,
            templates: [...BUILTIN_TEMPLATES, ...data.templates],
        };
    }

    /** Create or update an own template { id?, name, allowed: [ids] }. Built-in templates are copied, never changed. */
    saveTemplate({ id, name, allowed }) {
        const data = this.load();
        const cleanName = String(name || '').trim().slice(0, 60);
        if (!cleanName) return { status: 'error' };
        const existing = id && !String(id).startsWith('builtin-') ? data.templates.find((t) => t.id === id) : null;
        if (existing) {
            existing.name = cleanName;
            existing.allowed = [...new Set(allowed || [])];
        } else {
            data.templates.push({ id: `tpl-${crypto.randomUUID()}`, name: cleanName, allowed: [...new Set(allowed || [])] });
        }
        this.save();
        return { status: 'success', template: existing || data.templates[data.templates.length - 1] };
    }

    deleteTemplate(id) {
        const data = this.load();
        data.templates = data.templates.filter((t) => t.id !== id);
        this.save();
        return { status: 'success' };
    }

    /** Add a custom program (e.g. taken over from a student's running programs). Same id -> merged. */
    addCustomEntry(entry) {
        const data = this.load();
        if (!entry?.id || !entry.label) return { status: 'error' };
        const existing = data.customEntries.find((e) => e.id === entry.id);
        if (existing) Object.assign(existing, entry);
        else data.customEntries.push({ ...entry, custom: true });
        this.save();
        return { status: 'success', entry: existing || entry };
    }

    deleteCustomEntry(id) {
        const data = this.load();
        data.customEntries = data.customEntries.filter((e) => e.id !== id);
        data.templates.forEach((t) => { t.allowed = t.allowed.filter((a) => a !== id); });
        this.save();
        return { status: 'success' };
    }
}

export default new AppLockStore();
