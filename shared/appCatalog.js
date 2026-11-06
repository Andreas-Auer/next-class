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
 * Program lock: catalog of known programs, built-in templates and the matching rules.
 *
 * An entry identifies one program on each platform:
 *   win:   { exe: ['archicad.exe'] }              executable file name (case-insensitive, * wildcard)
 *   mac:   { bundleId: ['com.graphisoft.*'], app: ['Archicad*'] }   bundle id or .app name
 *   linux: { proc: ['qgis'] }                     process name (comm)
 *
 * Identifiers of commercial software change between versions. The teacher can always take the
 * exact identifiers from a student's list of running programs ("aus laufenden Programmen übernehmen").
 *
 * Pure module (no Node/Electron imports) - used by teacher, student and unit tests.
 */

export const APP_CATALOG = [
    // --- CAD / BIM / 3D
    { id: 'archicad', label: 'Archicad', category: 'CAD', win: { exe: ['archicad*.exe'] }, mac: { bundleId: ['com.graphisoft.*'], app: ['Archicad*'] } },
    { id: 'rhino', label: 'Rhino', category: 'CAD', win: { exe: ['rhino.exe'] }, mac: { bundleId: ['com.mcneel.rhinoceros*'], app: ['Rhino*'] } },
    { id: 'allplan', label: 'Allplan', category: 'CAD', win: { exe: ['allplan*.exe', 'nem.allplan*.exe'] } },
    { id: 'autocad', label: 'AutoCAD', category: 'CAD', win: { exe: ['acad.exe'] }, mac: { bundleId: ['com.autodesk.AutoCAD*'], app: ['AutoCAD*'] } },
    { id: 'revit', label: 'Revit', category: 'CAD', win: { exe: ['revit.exe'] } },
    { id: 'sketchup', label: 'SketchUp', category: 'CAD', win: { exe: ['sketchup.exe'] }, mac: { bundleId: ['com.sketchup.*'], app: ['SketchUp*'] } },
    { id: 'blender', label: 'Blender', category: 'CAD', win: { exe: ['blender.exe'] }, mac: { bundleId: ['org.blenderfoundation.blender'], app: ['Blender'] }, linux: { proc: ['blender'] } },
    { id: 'freecad', label: 'FreeCAD', category: 'CAD', win: { exe: ['freecad.exe'] }, mac: { app: ['FreeCAD'] }, linux: { proc: ['freecad', 'FreeCAD'] } },
    { id: 'twinmotion', label: 'Twinmotion', category: 'CAD', win: { exe: ['twinmotion*.exe'] }, mac: { app: ['Twinmotion*'] } },
    { id: 'enscape', label: 'Enscape', category: 'CAD', win: { exe: ['enscape*.exe'] } },
    { id: 'lumion', label: 'Lumion', category: 'CAD', win: { exe: ['lumion*.exe'] } },
    // --- GIS
    { id: 'qgis', label: 'QGIS', category: 'GIS', win: { exe: ['qgis*.exe'] }, mac: { bundleId: ['org.qgis.*'], app: ['QGIS*'] }, linux: { proc: ['qgis', 'qgis.bin'] } },
    { id: 'arcgis', label: 'ArcGIS Pro', category: 'GIS', win: { exe: ['arcgispro.exe'] } },
    // --- Office / documents
    { id: 'word', label: 'Microsoft Word', category: 'Office', win: { exe: ['winword.exe'] }, mac: { bundleId: ['com.microsoft.Word'] } },
    { id: 'excel', label: 'Microsoft Excel', category: 'Office', win: { exe: ['excel.exe'] }, mac: { bundleId: ['com.microsoft.Excel'] } },
    { id: 'powerpoint', label: 'Microsoft PowerPoint', category: 'Office', win: { exe: ['powerpnt.exe'] }, mac: { bundleId: ['com.microsoft.Powerpoint'] } },
    { id: 'onenote', label: 'Microsoft OneNote', category: 'Office', win: { exe: ['onenote*.exe'] }, mac: { bundleId: ['com.microsoft.onenote.mac'] } },
    { id: 'libreoffice', label: 'LibreOffice', category: 'Office', win: { exe: ['soffice*.exe'] }, mac: { bundleId: ['org.libreoffice.*'], app: ['LibreOffice'] }, linux: { proc: ['soffice.bin', 'soffice'] } },
    { id: 'pages', label: 'Pages / Numbers / Keynote', category: 'Office', mac: { bundleId: ['com.apple.iWork.*'] } },
    { id: 'acrobat', label: 'Adobe Acrobat / Reader', category: 'Office', win: { exe: ['acrord32.exe', 'acrobat.exe'] }, mac: { bundleId: ['com.adobe.Reader', 'com.adobe.Acrobat*'] } },
    { id: 'pdfviewer', label: 'PDF-Ansicht (Vorschau, Okular, Evince)', category: 'Office', mac: { bundleId: ['com.apple.Preview'] }, linux: { proc: ['okular', 'evince'] } },
    { id: 'texteditor', label: 'Texteditor (Editor, TextEdit, gedit)', category: 'Office', win: { exe: ['notepad.exe'] }, mac: { bundleId: ['com.apple.TextEdit'] }, linux: { proc: ['gedit', 'kate', 'gnome-text-editor'] } },
    { id: 'calculator', label: 'Rechner', category: 'Office', win: { exe: ['calculatorapp.exe', 'calc.exe'] }, mac: { bundleId: ['com.apple.calculator'] }, linux: { proc: ['gnome-calculator', 'kcalc'] } },
    // --- Design
    { id: 'photoshop', label: 'Adobe Photoshop', category: 'Design', win: { exe: ['photoshop.exe'] }, mac: { bundleId: ['com.adobe.Photoshop'] } },
    { id: 'illustrator', label: 'Adobe Illustrator', category: 'Design', win: { exe: ['illustrator.exe'] }, mac: { bundleId: ['com.adobe.illustrator'] } },
    { id: 'indesign', label: 'Adobe InDesign', category: 'Design', win: { exe: ['indesign.exe'] }, mac: { bundleId: ['com.adobe.InDesign'] } },
    { id: 'affinity', label: 'Affinity (Designer, Photo, Publisher)', category: 'Design', win: { exe: ['designer.exe', 'photo.exe', 'publisher.exe', 'affinity*.exe'] }, mac: { bundleId: ['com.seriflabs.*'] } },
    { id: 'gimp', label: 'GIMP', category: 'Design', win: { exe: ['gimp*.exe'] }, mac: { bundleId: ['org.gimp.*'] }, linux: { proc: ['gimp', 'gimp-2.10'] } },
    { id: 'inkscape', label: 'Inkscape', category: 'Design', win: { exe: ['inkscape.exe'] }, mac: { bundleId: ['org.inkscape.*'] }, linux: { proc: ['inkscape'] } },
    // --- Programming
    { id: 'vscode', label: 'Visual Studio Code', category: 'Programmierung', win: { exe: ['code.exe'] }, mac: { bundleId: ['com.microsoft.VSCode'] }, linux: { proc: ['code'] } },
    { id: 'terminal', label: 'Terminal / Eingabeaufforderung', category: 'Programmierung', win: { exe: ['windowsterminal.exe', 'cmd.exe', 'powershell.exe', 'pwsh.exe'] }, mac: { bundleId: ['com.apple.Terminal'] }, linux: { proc: ['gnome-terminal-server', 'konsole', 'xterm'] } },
    // --- Browsers (only useful together with an internet whitelist, e.g. for a learning platform)
    { id: 'edge', label: 'Microsoft Edge', category: 'Browser', win: { exe: ['msedge.exe'] }, mac: { bundleId: ['com.microsoft.edgemac'] }, linux: { proc: ['msedge'] } },
    { id: 'chrome', label: 'Google Chrome', category: 'Browser', win: { exe: ['chrome.exe'] }, mac: { bundleId: ['com.google.Chrome'] }, linux: { proc: ['chrome'] } },
    { id: 'firefox', label: 'Firefox', category: 'Browser', win: { exe: ['firefox.exe'] }, mac: { bundleId: ['org.mozilla.firefox'] }, linux: { proc: ['firefox'] } },
    { id: 'safari', label: 'Safari', category: 'Browser', mac: { bundleId: ['com.apple.Safari'] } },
    // --- Communication (blocked by default, see BACKGROUND_BLOCKLIST)
    { id: 'teams', label: 'Microsoft Teams', category: 'Kommunikation', win: { exe: ['ms-teams.exe', 'teams.exe'] }, mac: { bundleId: ['com.microsoft.teams*'] }, linux: { proc: ['teams-for-linux'] } },
    { id: 'outlook', label: 'Microsoft Outlook', category: 'Kommunikation', win: { exe: ['outlook.exe', 'olk.exe'] }, mac: { bundleId: ['com.microsoft.Outlook'] } },
];

/** Built-in templates (the teacher can copy and change them; own templates are stored on the teacher device). */
export const BUILTIN_TEMPLATES = [
    { id: 'builtin-cad', name: 'CAD-Unterricht', builtin: true, allowed: ['archicad', 'rhino', 'allplan', 'autocad', 'revit', 'sketchup', 'blender', 'twinmotion', 'enscape', 'lumion', 'acrobat', 'pdfviewer', 'calculator'] },
    { id: 'builtin-gis', name: 'GIS-Unterricht', builtin: true, allowed: ['qgis', 'arcgis', 'excel', 'libreoffice', 'acrobat', 'pdfviewer', 'calculator'] },
    { id: 'builtin-office', name: 'Office', builtin: true, allowed: ['word', 'excel', 'powerpoint', 'onenote', 'libreoffice', 'pages', 'acrobat', 'pdfviewer', 'texteditor', 'calculator'] },
    { id: 'builtin-design', name: 'Design', builtin: true, allowed: ['photoshop', 'illustrator', 'indesign', 'affinity', 'gimp', 'inkscape', 'acrobat', 'pdfviewer'] },
];

/**
 * Communication / remote-control programs that are also closed when they run without a window
 * (tray, background). Exact process names (lower case, without .exe), so no false hits by substring.
 * Not applied to programs the teacher explicitly allowed.
 */
export const BACKGROUND_BLOCKLIST = [
    'discord', 'whatsapp', 'whatsapp.root', 'telegram', 'telegram-desktop', 'signal', 'signal-desktop', 'slack',
    'ms-teams', 'teams', 'msteams', 'skype', 'zoom', 'zoom.us', 'viber', 'element', 'element-desktop', 'thunderbird',
    'steam', 'steamwebhelper', 'epicgameslauncher', 'battle.net',
    'anydesk', 'teamviewer', 'rustdesk', 'parsec', 'chatgpt', 'claude', 'perplexity', 'ollama', 'lm studio',
];

/** Entry ids of the background blocklist that map to catalog entries (so "Teams erlaubt" also lifts the background rule). */
const BLOCKLIST_ENTRY = { 'ms-teams': 'teams', teams: 'teams', msteams: 'teams' };

/**
 * Windowed processes that are never closed: the desktop shell and core system UI.
 * win: lower-case exe names without .exe; mac: bundle ids.
 */
export const PROTECTED = {
    win: ['explorer', 'dwm', 'shellexperiencehost', 'startmenuexperiencehost', 'searchhost', 'searchapp', 'textinputhost',
        'applicationframehost', 'systemsettings', 'lockapp', 'logonui', 'taskmgr', 'securityhealthsystray', 'ctfmon',
        'rundll32', 'consent', 'credentialuibroker', 'openwith', 'pickerhost', 'widgets', 'nvidia overlay', 'crashpad_handler',
        'next-class-student', 'next-class-teacher'],
    mac: ['com.apple.finder', 'com.apple.dock', 'com.apple.systemuiserver', 'com.apple.controlcenter', 'com.apple.notificationcenterui',
        'com.apple.Spotlight', 'com.apple.loginwindow', 'com.apple.systempreferences', 'com.apple.ActivityMonitor',
        'com.apple.SecurityAgent', 'com.apple.coreservices.uiagent', 'com.apple.screencaptureui', 'com.apple.Siri',
        'com.github.Electron', 'com.nextclass.student', 'com.nextclass.teacher'],
    linux: ['gnome-shell', 'plasmashell', 'kwin_x11', 'kwin_wayland', 'xfwm4', 'xfce4-panel', 'nautilus', 'dolphin', 'thunar', 'nemo',
        // Next-Class itself (comm is cut to 15 characters on Linux)
        'next-class-student', 'next-class-stud', 'next-class-teacher', 'next-class-teac'],
};

/** Glob (only * supported) -> case-insensitive RegExp. */
export function globToRegExp(glob) {
    const escaped = String(glob).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`, 'i');
}

function anyGlob(globs, value) {
    if (!value || !Array.isArray(globs)) return false;
    return globs.some((g) => globToRegExp(g).test(value));
}

/** Normalized process name: lower case, without directory and .exe. */
export function processKey(name) {
    return String(name || '').split(/[\\/]/).pop().replace(/\.exe$/i, '').toLowerCase();
}

/**
 * Does a running program match an allowlist entry?
 * proc: { name, exe?, bundleId?, appName? }  platform: 'win32' | 'darwin' | 'linux'
 */
export function matchesEntry(proc, entry, platform) {
    if (!proc || !entry) return false;
    if (platform === 'win32') {
        const exe = String(proc.exe || proc.name || '').split(/[\\/]/).pop();
        const withExt = /\.exe$/i.test(exe) ? exe : `${exe}.exe`;
        return anyGlob(entry.win?.exe, withExt);
    }
    if (platform === 'darwin') {
        return anyGlob(entry.mac?.bundleId, proc.bundleId) || anyGlob(entry.mac?.app, proc.appName);
    }
    return anyGlob(entry.linux?.proc, proc.name);
}

export function isProtected(proc, platform) {
    if (proc.system) return true;   // OS component (set by the platform process list)
    if (platform === 'win32') return PROTECTED.win.includes(processKey(proc.exe || proc.name));
    if (platform === 'darwin') return PROTECTED.mac.includes(proc.bundleId);
    return PROTECTED.linux.includes(processKey(proc.name));
}

/** Resolve a list of entry ids (+ custom entries) into full entries. */
export function resolveEntries(ids = [], customEntries = []) {
    const all = [...APP_CATALOG, ...customEntries];
    return ids.map((id) => all.find((e) => e.id === id)).filter(Boolean);
}

/**
 * Decide what to do with one running program.
 * Returns 'allowed' | 'protected' | 'blocked'.
 * windowed=false (background process) is only blocked when it is on the background blocklist.
 */
export function classify(proc, allowedEntries, platform) {
    if (isProtected(proc, platform)) return 'protected';
    if (allowedEntries.some((e) => matchesEntry(proc, e, platform))) return 'allowed';
    if (proc.windowed === false) {
        const key = processKey(proc.exe || proc.name);
        if (!BACKGROUND_BLOCKLIST.includes(key)) return 'allowed';
        const entryId = BLOCKLIST_ENTRY[key];
        if (entryId && allowedEntries.some((e) => e.id === entryId)) return 'allowed';
    }
    return 'blocked';
}

/** A custom entry built from a running program a student reported (teacher "übernehmen"). */
export function entryFromRunningApp(app, platform) {
    const label = app.appName || app.name;
    const id = `custom-${platform}-${processKey(app.bundleId || app.exe || app.name).replace(/[^a-z0-9.-]/g, '_')}`;
    if (platform === 'win32') return { id, label, custom: true, win: { exe: [String(app.exe || app.name).split(/[\\/]/).pop().toLowerCase()] } };
    if (platform === 'darwin') return { id, label, custom: true, mac: app.bundleId ? { bundleId: [app.bundleId] } : { app: [app.appName] } };
    return { id, label, custom: true, linux: { proc: [app.name] } };
}
