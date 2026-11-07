// End-to-end test: team teaching with two teacher apps and one student.
// Run: npm run test:e2e   (builds the apps first)

import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.join(import.meta.dirname, '..');
const electronMain = 'dist/electron/UnPackaged/electron-main.js';
const teacherMain = path.join(repoRoot, 'teacher', electronMain);
const studentMain = path.join(repoRoot, 'student', electronMain);
const hostPort = '24522';
const coPort = '24622';   // the co-teacher app runs its own (unused) server on another port
const shotDir = process.env.NC_E2E_SCREENSHOTS;

async function shot(page, name) {
  if (shotDir) await page.screenshot({ path: path.join(shotDir, `${name}.png`) });
}

async function getAppWindow(app) {
  await app.firstWindow();
  await expect.poll(() => app.windows().some((p) => p.url().startsWith('file:')), { timeout: 30_000 }).toBe(true);
  return app.windows().find((p) => p.url().startsWith('file:'));
}

/** First start of a teacher app: enter the name once (the submission folder keeps its default). */
async function completeWelcome(page, name) {
  const welcome = page.locator('[data-e2e="welcome"]');
  await expect(welcome).toBeVisible({ timeout: 15_000 });
  await expect(welcome.locator('[data-e2e="folder-path"]')).toContainText('Next-Class Abgaben');
  await welcome.locator('[data-e2e="welcome-name"]').fill(name);
  await welcome.locator('[data-e2e="welcome-save"]').click();
  await expect(page.locator('[data-e2e="session-name"]')).toBeVisible();
}

async function confirmInterfacePicker(page) {
  const dialog = page.locator('.swal2-popup').filter({ has: page.locator('select.swal2-select') });
  if (await dialog.isVisible({ timeout: 4_000 }).catch(() => false)) {
    await dialog.locator('.swal2-confirm').click();
    await expect(dialog).toBeHidden();
  }
}

test('co-teacher joins with code + approval and controls the session', async () => {
  test.setTimeout(180_000);
  const sessionName = `team-${Date.now().toString().slice(-6)}`;
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'next-class-e2e-team-'));
  const launch = (main, dir, port) => electron.launch({
    args: [`--user-data-dir=${path.join(profileRoot, dir)}`, main],
    cwd: path.dirname(path.dirname(path.dirname(path.dirname(main)))),
    env: { ...process.env, DEBUG: '1', NXE_E2E_SERVER_API_PORT: port, NEXT_CLASS_APPLOCK_FILE: path.join(profileRoot, `${dir}-applock.json`) },
  });
  let hostApp, coApp, studentApp;

  try {
    let host, co, student, teacherCode, pin;

    await test.step('host starts a session', async () => {
      hostApp = await launch(teacherMain, 'host', hostPort);
      host = await getAppWindow(hostApp);
      await confirmInterfacePicker(host);
      await completeWelcome(host, 'Herr Auer');
      await host.locator('[data-e2e="session-name"]').fill(sessionName);
      await host.locator('[data-e2e="session-start"]').click();
      await expect(host.locator('[data-e2e="teacher-code"]')).toHaveText(/^\d{6}$/, { timeout: 15_000 });
      teacherCode = (await host.locator('[data-e2e="teacher-code"]').textContent()).trim();
      pin = (await host.locator('[data-e2e="session-pin"]').textContent()).trim();
    });

    await test.step('co-teacher finds the session by IP and asks to join with a wrong, then the right code', async () => {
      coApp = await launch(teacherMain, 'co', coPort);
      co = await getAppWindow(coApp);
      await confirmInterfacePicker(co);
      await completeWelcome(co, 'Frau Huber');
      await co.locator('[data-e2e="cojoin-address"]').fill(`127.0.0.1:${hostPort}`);
      await co.locator('[data-e2e="cojoin-search"]').click();
      const joinButton = co.locator(`[data-e2e="cojoin-${sessionName}"]`).first();
      await expect(joinButton).toBeVisible({ timeout: 15_000 });

      await joinButton.click();
      await co.locator('#co-code').fill(teacherCode === '000000' ? '000001' : '000000');
      await co.locator('.swal2-confirm').click();
      await expect(co.locator('.swal2-html-container')).toContainText('Lehrer-Code', { timeout: 10_000 });
      await co.locator('.swal2-confirm').click();

      await joinButton.click();
      await co.locator('#co-code').fill(teacherCode);
      await co.locator('.swal2-confirm').click();
      await expect(co.locator('.swal2-title')).toContainText('Bestätigung', { timeout: 10_000 });
    });

    await test.step('host approves', async () => {
      await expect(host.locator('.swal2-title')).toContainText('Lehrkraft', { timeout: 15_000 });
      await expect(host.locator('.swal2-html-container')).toContainText('Frau Huber');
      await host.locator('.swal2-confirm').click();
      await expect(co.locator('[data-e2e="coteacher-leave"]')).toBeVisible({ timeout: 15_000 });
      await expect(host.locator('[data-e2e="teacher-Frau Huber"]')).toBeVisible({ timeout: 10_000 });
      await expect(co.locator('[data-e2e="teacher-Herr Auer"]')).toBeVisible({ timeout: 10_000 });   // equal teachers, listed by name
      await expect(co.locator('[data-e2e="session-pin"]')).toHaveText(pin);
    });

    await test.step('student joins; both teachers see the student', async () => {
      studentApp = await launch(studentMain, 'student', hostPort);
      student = await getAppWindow(studentApp);
      await confirmInterfacePicker(student);
      await student.locator('[data-e2e="name"]').fill('team-schueler');
      await student.locator('[data-e2e="pin"]').fill(pin);
      const manual = student.locator('[data-e2e="manual-search"]');
      if (!(await manual.isChecked())) await manual.check();
      await student.locator('[data-e2e="server-ip"]').fill('127.0.0.1');
      await expect(student.locator(`[data-e2e="session-${sessionName}"]`)).toBeVisible({ timeout: 30_000 });
      await student.locator('[data-e2e="join"]').click();
      await expect(student.locator('[data-e2e="connected-card"]')).toBeVisible({ timeout: 20_000 });
      for (const page of [host, co]) {
        await expect(page.locator('[data-e2e="student-team-schueler"] [data-e2e="badge-online"]')).toBeVisible({ timeout: 20_000 });
      }
    });

    await test.step('co-teacher locks the screens; host sees the same state', async () => {
      await co.locator('[data-e2e="lock-screens"]').click();
      await expect.poll(() => studentApp.windows().some((p) => p.url().includes('#/lock')), { timeout: 20_000 }).toBe(true);
      await expect(host.locator('[data-e2e="lock-screens"]')).toHaveClass(/btn-warning/, { timeout: 10_000 });   // synced
      await shot(co, '10-co-lehrkraft');
      await host.locator('[data-e2e="lock-screens"]').click();                                             // host unlocks
      await expect.poll(() => studentApp.windows().some((p) => p.url().includes('#/lock')), { timeout: 20_000 }).toBe(false);
      await expect(co.locator('[data-e2e="lock-screens"]')).not.toHaveClass(/btn-warning/, { timeout: 10_000 });
    });

    await test.step('host ends the session; co-teacher is informed', async () => {
      await host.locator('[data-e2e="session-end"]').click();
      await host.locator('.swal2-confirm').click();
      await expect(co.locator('.swal2-title')).toContainText('beendet', { timeout: 15_000 });
      await co.locator('.swal2-confirm').click();
      await expect(co.locator('[data-e2e="session-start"]')).toBeVisible({ timeout: 10_000 });
    });
  } finally {
    for (const app of [studentApp, coApp, hostApp]) {
      await app?.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) w.allowexit = true; }).catch(() => {});
      await app?.close().catch(() => {});
    }
    await fs.rm(profileRoot, { recursive: true, force: true });
  }
});

test('host app crashes: co-teacher takes over, student reconnects, lock stays', async () => {
  test.setTimeout(240_000);
  const sessionName = `failover-${Date.now().toString().slice(-6)}`;
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'next-class-e2e-failover-'));
  const launch = (main, dir, port) => electron.launch({
    args: [`--user-data-dir=${path.join(profileRoot, dir)}`, main],
    cwd: path.dirname(path.dirname(path.dirname(path.dirname(main)))),
    env: { ...process.env, DEBUG: '1', NXE_E2E_SERVER_API_PORT: port, NEXT_CLASS_APPLOCK_FILE: path.join(profileRoot, `${dir}-applock.json`) },
  });
  let hostApp, coApp, studentApp;

  try {
    let host, co, student;
    const lockVisible = () => studentApp.windows().some((p) => p.url().includes('#/lock'));

    await test.step('host + co-teacher + student, screens locked', async () => {
      hostApp = await launch(teacherMain, 'host', hostPort);
      host = await getAppWindow(hostApp);
      await confirmInterfacePicker(host);
      await completeWelcome(host, 'Herr Auer');
      await host.locator('[data-e2e="session-name"]').fill(sessionName);
      await host.locator('[data-e2e="session-start"]').click();
      await expect(host.locator('[data-e2e="teacher-code"]')).toHaveText(/^\d{6}$/, { timeout: 15_000 });
      const teacherCode = (await host.locator('[data-e2e="teacher-code"]').textContent()).trim();
      const pin = (await host.locator('[data-e2e="session-pin"]').textContent()).trim();

      coApp = await launch(teacherMain, 'co', coPort);
      co = await getAppWindow(coApp);
      await confirmInterfacePicker(co);
      await completeWelcome(co, 'Frau Huber');
      await co.locator('[data-e2e="cojoin-address"]').fill(`127.0.0.1:${hostPort}`);
      await co.locator('[data-e2e="cojoin-search"]').click();
      await co.locator(`[data-e2e="cojoin-${sessionName}"]`).first().click();
      await co.locator('#co-code').fill(teacherCode);
      await co.locator('.swal2-confirm').click();
      await expect(host.locator('.swal2-title')).toContainText('Lehrkraft', { timeout: 15_000 });
      await host.locator('.swal2-confirm').click();
      await expect(co.locator('[data-e2e="coteacher-leave"]')).toBeVisible({ timeout: 15_000 });

      studentApp = await launch(studentMain, 'student', hostPort);
      student = await getAppWindow(studentApp);
      await confirmInterfacePicker(student);
      await student.locator('[data-e2e="name"]').fill('failover-schueler');
      await student.locator('[data-e2e="pin"]').fill(pin);
      const manual = student.locator('[data-e2e="manual-search"]');
      if (!(await manual.isChecked())) await manual.check();
      await student.locator('[data-e2e="server-ip"]').fill('127.0.0.1');
      await expect(student.locator(`[data-e2e="session-${sessionName}"]`)).toBeVisible({ timeout: 30_000 });
      await student.locator('[data-e2e="join"]').click();
      await expect(student.locator('[data-e2e="connected-card"]')).toBeVisible({ timeout: 20_000 });
      // the co-teacher must have learned about the student (replica) and the student about the co-teacher (backups)
      await co.waitForTimeout(12_000);

      await host.locator('[data-e2e="lock-screens"]').click();
      await expect.poll(lockVisible, { timeout: 20_000 }).toBe(true);
    });

    await test.step('host crashes -> co-teacher becomes host', async () => {
      hostApp.process().kill('SIGKILL');
      hostApp = null;
      await expect(co.locator('.swal2-title')).toContainText('leitest jetzt', { timeout: 60_000 });
      await co.locator('.swal2-confirm').click();
      await expect(co.locator('[data-e2e="role"]')).toHaveText('Lehrer');
      await expect(co.locator('[data-e2e="session-end"]')).toBeVisible();
    });

    await test.step('student stays locked and reconnects to the new host by itself', async () => {
      expect(lockVisible()).toBe(true);
      const tile = co.locator('[data-e2e="student-failover-schueler"]');
      await expect(tile.locator('[data-e2e="badge-online"]')).toBeVisible({ timeout: 90_000 });
      await shot(co, '11-uebernahme');
    });

    await test.step('new host unlocks and ends the session', async () => {
      await expect(co.locator('[data-e2e="lock-screens"]')).toHaveClass(/btn-warning/);   // lock state was taken over
      await co.locator('[data-e2e="lock-screens"]').click();
      await expect.poll(lockVisible, { timeout: 20_000 }).toBe(false);
      await co.locator('[data-e2e="session-end"]').click();
      await co.locator('.swal2-confirm').click();
      await expect(co.locator('[data-e2e="session-start"]')).toBeVisible({ timeout: 10_000 });
    });
  } finally {
    for (const app of [studentApp, coApp, hostApp]) {
      await app?.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) w.allowexit = true; }).catch(() => {});
      await app?.close().catch(() => {});
    }
    await fs.rm(profileRoot, { recursive: true, force: true });
  }
});
