// End-to-end test: teacher starts a session, a student joins, teacher locks/unlocks screens, student leaves.
// Run: npm run test:e2e   (builds both apps unpackaged first)

import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const repoRoot = path.join(import.meta.dirname, '..');
const electronMain = 'dist/electron/UnPackaged/electron-main.js';
const teacherMain = path.join(repoRoot, 'teacher', electronMain);
const studentMain = path.join(repoRoot, 'student', electronMain);
const serverApiPort = '23522';   // isolated from a real Next-Class teacher on this machine
const helperAddr = '127.0.0.1:23533';
const goos = { win32: 'windows', darwin: 'darwin', linux: 'linux' }[process.platform];
const goarch = process.arch === 'x64' ? 'amd64' : process.arch;
const helperBin = path.join(repoRoot, 'helper', 'dist', `${goos}-${goarch}`, process.platform === 'win32' ? 'nextclass-helper.exe' : 'nextclass-helper');
const shotDir = process.env.NC_E2E_SCREENSHOTS;   // optional: save UI screenshots for documentation

async function shot(page, name) {
  if (shotDir) await page.screenshot({ path: path.join(shotDir, `${name}.png`) });
}

/** First renderer window loaded from file:// (skips DevTools windows). */
async function getAppWindow(app) {
  await app.firstWindow();
  await expect.poll(() => app.windows().some((p) => p.url().startsWith('file:')), { timeout: 30_000 }).toBe(true);
  return app.windows().find((p) => p.url().startsWith('file:'));
}

function attachDiagnostics(label, app, page) {
  page.on('pageerror', (e) => console.error(`[${label}] page error: ${e.stack || e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') console.error(`[${label}] console error: ${m.text()}`); });
  app.process().once('exit', (code) => { if (code) console.error(`[${label}] exited with ${code}`); });
}

/** Confirm the "select network" dialog if this machine has several interfaces. */
async function confirmInterfacePicker(page) {
  const dialog = page.locator('.swal2-popup').filter({ has: page.locator('select.swal2-select') });
  if (await dialog.isVisible({ timeout: 4_000 }).catch(() => false)) {
    await dialog.locator('.swal2-confirm').click();
    await expect(dialog).toBeHidden();
  }
}

async function closeSwal(page) {
  const confirm = page.locator('.swal2-container .swal2-confirm');
  if (await confirm.isVisible({ timeout: 1_000 }).catch(() => false)) await confirm.click();
}

test('student joins with PIN, reconnects, gets locked and unlocked, then leaves', async () => {
  test.setTimeout(180_000);
  const sessionName = `e2e-${Date.now().toString().slice(-6)}`;
  const studentName = 'e2e-schueler';
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'next-class-e2e-'));
  // the real helper in dry-run mode: full API and watchdog, but the firewall is never touched
  const helperToken = 'e2e-token-0123456789abcdef0123456789';
  const tokenFile = path.join(profileRoot, 'helper-token');
  await fs.writeFile(tokenFile, helperToken);
  const helperProc = spawn(helperBin, ['run', '--dry-run', '--addr', helperAddr, '--token-file', tokenFile], { stdio: 'ignore' });
  const helper = async (route, method = 'GET') => (await fetch(`http://${helperAddr}${route}`, { method, headers: { 'X-NextClass-Token': helperToken } })).json();

  const env = {
    ...process.env, DEBUG: '1', NXE_E2E_SERVER_API_PORT: serverApiPort,
    NEXT_CLASS_HELPER_ADDR: helperAddr, NEXT_CLASS_HELPER_TOKEN_FILE: tokenFile,
    NEXT_CLASS_APPLOCK_GRACE: '4',                                            // short warning period for the test
    NEXT_CLASS_APPLOCK_FILE: path.join(profileRoot, 'applock.json'),          // keep test templates out of the real profile
  };
  let teacherApp;
  let studentApp;

  try {
    let teacher;
    let student;
    let pin;

    await test.step('teacher starts a session', async () => {
      teacherApp = await electron.launch({ args: [`--user-data-dir=${path.join(profileRoot, 'teacher')}`, teacherMain], cwd: path.join(repoRoot, 'teacher'), env });
      teacher = await getAppWindow(teacherApp);
      attachDiagnostics('TEACHER', teacherApp, teacher);
      await confirmInterfacePicker(teacher);
      await teacher.locator('[data-e2e="session-name"]').fill(sessionName);
      await teacher.locator('[data-e2e="session-start"]').click();
      await expect(teacher.locator('[data-e2e="session-pin"]')).toHaveText(/^\d{4}$/, { timeout: 15_000 });
      pin = (await teacher.locator('[data-e2e="session-pin"]').textContent()).trim();
      await shot(teacher, '1-lehrer-leer');
    });

    await test.step('student joins via manual IP', async () => {
      studentApp = await electron.launch({ args: [`--user-data-dir=${path.join(profileRoot, 'student')}`, studentMain], cwd: path.join(repoRoot, 'student'), env });
      student = await getAppWindow(studentApp);
      attachDiagnostics('STUDENT', studentApp, student);
      await confirmInterfacePicker(student);
      await student.locator('[data-e2e="name"]').fill(studentName);
      await student.locator('[data-e2e="pin"]').fill(pin === '0000' ? '0001' : '0000');   // wrong PIN first
      const manual = student.locator('[data-e2e="manual-search"]');
      if (!(await manual.isChecked())) await manual.check();
      await student.locator('[data-e2e="server-ip"]').fill('127.0.0.1');
      await expect(student.locator(`[data-e2e="session-${sessionName}"]`)).toBeVisible({ timeout: 30_000 });
      await student.locator('[data-e2e="join"]').click();
      await expect(student.locator('.swal2-html-container')).toContainText('PIN', { timeout: 20_000 });
      await closeSwal(student);
      await student.locator('[data-e2e="pin"]').fill(pin);
      await shot(student, '2-schueler-beitreten');
      await student.locator('[data-e2e="join"]').click();   // name + PIN only, the matching session is found automatically
      await expect(student.locator('.swal2-title')).toHaveText('OK', { timeout: 20_000 });
      await closeSwal(student);
      await expect(student.locator('[data-e2e="connected-card"]')).toBeVisible();
      await shot(student, '3-schueler-verbunden');
    });

    const card = () => teacher.locator(`[data-e2e="student-${studentName}"]`);

    await test.step('teacher sees the student online', async () => {
      await expect(card()).toBeVisible({ timeout: 20_000 });
      await expect(card().locator('[data-e2e="badge-online"]')).toBeVisible();
    });

    await test.step('teacher receives the live view (or sees why not)', async () => {
      // macOS: without "Screen Recording" permission for this Electron binary the teacher gets a badge instead of an image
      const image = card().locator('.thumb img');
      const noPermission = card().locator('[data-e2e="badge-nopermission"]');
      await expect(image.or(noPermission)).toBeVisible({ timeout: 20_000 });
      if (await image.isVisible()) await expect(image).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
      else console.warn('live view: no screen recording permission on this machine - badge shown instead of an image');
    });

    await test.step('unchanged screen -> teacher sees a counter from 2 minutes on', async () => {
      await student.evaluate(() => window.ipcRenderer.invoke('e2e-force-unchanged', 90));
      await teacher.waitForTimeout(7_000);   // two heartbeats
      await expect(card().locator('[data-e2e="badge-idle"]')).toBeHidden();   // 1:30 is below the 2 min threshold
      await student.evaluate(() => window.ipcRenderer.invoke('e2e-force-unchanged', 150));
      const badge = card().locator('[data-e2e="badge-idle"]');
      await expect(badge).toBeVisible({ timeout: 15_000 });
      await expect(badge).toContainText(/⏸ 2:[3-5]\d/);
      const first = await badge.textContent();
      await teacher.waitForTimeout(2_200);
      expect(await badge.textContent()).not.toBe(first);   // the counter keeps running
      await shot(teacher, '5-lehrer-inaktiv');
      await teacher.locator('[data-e2e="idle-threshold"]').selectOption('300');   // threshold 5 min -> badge disappears
      await expect(badge).toBeHidden({ timeout: 5_000 });
      await teacher.locator('[data-e2e="idle-threshold"]').selectOption('120');
    });

    await test.step('program lock: template + program taken over from the student, violations reported', async () => {
      // simulated programs - nothing real is touched (unpackaged builds only report anyway)
      const fakeApps = [
        { pid: 900001, name: 'ARCHICAD', exe: 'ARCHICAD.exe', bundleId: 'com.graphisoft.ARCHICAD-64.27', appName: 'Archicad 27', windowed: true },
        { pid: 900002, name: 'MyTool', exe: 'MyTool.exe', bundleId: 'at.htl.mytool', appName: 'MyTool', windowed: true },
        { pid: 900003, name: 'Brave Browser', exe: 'brave.exe', bundleId: 'com.brave.Browser', appName: 'Brave Browser', windowed: true },
        { pid: 900004, name: 'Discord', exe: 'Discord.exe', bundleId: 'com.hnc.Discord', appName: 'Discord', windowed: false },
      ];
      await student.evaluate((apps) => window.ipcRenderer.invoke('e2e-fake-apps', apps), fakeApps);

      await teacher.locator('[data-e2e="applock-template"]').selectOption('builtin-cad');
      await teacher.locator('[data-e2e="applock-pick"]').click();
      await expect(teacher.locator('[data-e2e="app-archicad"]')).toBeChecked();
      await expect(teacher.locator('[data-e2e="app-word"]')).not.toBeChecked();
      await teacher.locator('[data-e2e="applock-picker-apply"]').click();

      // take over "MyTool" from the student's running programs
      await card().locator('[data-e2e="running-apps"]').click();
      const allowMyTool = teacher.locator('[data-e2e="allow-MyTool"]');
      await expect(allowMyTool).toBeVisible({ timeout: 25_000 });
      await allowMyTool.click();
      await teacher.locator('[data-e2e="running-apps-dialog"]').locator('.btn-close').click();

      await teacher.locator('[data-e2e="applock-toggle"]').click();
      await teacher.locator('.swal2-confirm').click();
      await expect(student.locator('[data-e2e="applock-grace"]')).toBeVisible({ timeout: 10_000 });
      await shot(student, '6-schueler-vorwarnung');
      await expect(student.locator('[data-e2e="applock-active"]')).toBeVisible({ timeout: 15_000 });

      await expect.poll(async () => {
        const info = await student.evaluate(() => window.ipcRenderer.invoke('getinfoasync'));
        return (info.clientinfo.applock?.violations || []).map((v) => v.name).sort().join(',');
      }, { timeout: 15_000 }).toBe('Brave Browser,Discord');
      await expect(card().locator('[data-e2e="badge-violation"]')).toContainText('gemeldet', { timeout: 15_000 });
      await expect(card().locator('[data-e2e="badge-applock"]')).toBeVisible();
      await shot(teacher, '7-lehrer-programmsperre');

      await teacher.locator('[data-e2e="applock-toggle"]').click();   // lift
      await expect(student.locator('[data-e2e="applock-active"]')).toBeHidden({ timeout: 15_000 });
      await expect(card().locator('[data-e2e="badge-applock"]')).toBeHidden({ timeout: 15_000 });
    });

    await test.step('internet lock via the helper (dry-run): lock, tamper is repaired and reported, release', async () => {
      await expect(student.locator('[data-e2e="netlock-setup"]')).toBeHidden();   // helper "installed" (token file present)
      await teacher.locator('[data-e2e="netlock-end"]').selectOption('50');
      await teacher.locator('[data-e2e="netlock-toggle"]').click();
      await teacher.locator('.swal2-confirm').click();
      await expect(teacher.locator('[data-e2e="netlock-until"]')).toBeVisible();
      await expect(student.locator('[data-e2e="netlock-active"]')).toBeVisible({ timeout: 15_000 });
      await expect(card().locator('[data-e2e="badge-netlock"]')).toBeVisible({ timeout: 15_000 });

      const st = await helper('/v1/status');
      expect(st.locked).toBe(true);
      expect(st.allow.some((a) => /\/\d+$/.test(a) && !a.endsWith('/32'))).toBe(true);   // own subnet
      const minutesLeft = (st.until - Date.now()) / 60000;
      expect(minutesLeft).toBeGreaterThan(53);   // 50 min + 5 min buffer without contact
      expect(minutesLeft).toBeLessThan(56);
      const rules = await helper('/v1/dryrun/rules');
      expect(rules.rules).toContain('meta nfproto ipv4 drop');

      await helper('/v1/dryrun/tamper', 'POST');   // a student deletes the firewall rules
      await expect(card().locator('[data-e2e="badge-tamper"]')).toBeVisible({ timeout: 20_000 });
      await shot(teacher, '8-lehrer-internetsperre');
      expect((await helper('/v1/status')).events[0].kind).toBe('restored');

      await teacher.locator('[data-e2e="netlock-toggle"]').click();   // release
      await expect(student.locator('[data-e2e="netlock-active"]')).toBeHidden({ timeout: 15_000 });
      await expect.poll(async () => (await helper('/v1/status')).locked, { timeout: 15_000 }).toBe(false);
    });

    await test.step('network dropout -> student reconnects automatically, teacher keeps one tile', async () => {
      await student.evaluate(() => window.ipcRenderer.invoke('e2e-drop-connection'));
      // the "reconnecting" notice may be visible only briefly - what matters is that the connection comes back by itself
      await expect.poll(async () => (await student.evaluate(() => window.ipcRenderer.invoke('getinfoasync'))).clientinfo.token, { timeout: 5_000 }).toBeFalsy();
      await expect.poll(async () => (await student.evaluate(() => window.ipcRenderer.invoke('getinfoasync'))).clientinfo.token, { timeout: 20_000 }).toBeTruthy();
      await expect(student.locator('[data-e2e="connected-card"]')).toBeVisible({ timeout: 10_000 });
      await expect(teacher.locator('.studentwidget')).toHaveCount(1);
      await expect(card().locator('[data-e2e="badge-online"]')).toBeVisible({ timeout: 10_000 });
    });

    await test.step('teacher locks screens -> student shows lock window', async () => {
      await teacher.locator('[data-e2e="lock-screens"]').click();
      await expect.poll(() => studentApp.windows().some((p) => p.url().includes('#/lock')), { timeout: 20_000 }).toBe(true);
      await expect(card().locator('[data-e2e="badge-locked"]')).toBeVisible({ timeout: 20_000 });
      await shot(teacher, '4-lehrer-gesperrt');
    });

    await test.step('teacher unlocks screens -> lock window closes', async () => {
      await teacher.locator('[data-e2e="lock-screens"]').click();
      await expect.poll(() => studentApp.windows().some((p) => p.url().includes('#/lock')), { timeout: 20_000 }).toBe(false);
      await expect(card().locator('[data-e2e="badge-locked"]')).toBeHidden({ timeout: 20_000 });
    });

    await test.step('student leaves -> teacher list is empty', async () => {
      await student.locator('[data-e2e="leave"]').click();
      await student.locator('.swal2-confirm').click();
      await expect(student.locator('[data-e2e="join"]')).toBeVisible({ timeout: 20_000 });
      await expect(card()).toBeHidden({ timeout: 10_000 });
      // no automatic reconnect after leaving on purpose
      await student.waitForTimeout(7_000);
      await expect(student.locator('[data-e2e="reconnecting"]')).toBeHidden();
      await expect(card()).toBeHidden();
    });

    await test.step('teacher ends the session', async () => {
      await teacher.locator('[data-e2e="session-end"]').click();
      await teacher.locator('.swal2-confirm').click();
      await expect(teacher.locator('[data-e2e="session-start"]')).toBeVisible({ timeout: 10_000 });
    });
  } finally {
    for (const app of [studentApp, teacherApp]) {
      await app?.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) w.allowexit = true; }).catch(() => {});
      await app?.close().catch(() => {});
    }
    helperProc.kill();
    await fs.rm(profileRoot, { recursive: true, force: true });
  }
});
