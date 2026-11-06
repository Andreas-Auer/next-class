// End-to-end test: teacher starts a session, a student joins, teacher locks/unlocks screens, student leaves.
// Run: npm run test:e2e   (builds both apps unpackaged first)

import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.join(import.meta.dirname, '..');
const electronMain = 'dist/electron/UnPackaged/electron-main.js';
const teacherMain = path.join(repoRoot, 'teacher', electronMain);
const studentMain = path.join(repoRoot, 'student', electronMain);
const serverApiPort = '23522';   // isolated from a real Next-Class teacher on this machine
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
  const env = { ...process.env, DEBUG: '1', NXE_E2E_SERVER_API_PORT: serverApiPort };
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
    await fs.rm(profileRoot, { recursive: true, force: true });
  }
});
