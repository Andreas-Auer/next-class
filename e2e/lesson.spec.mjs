// End-to-end test: lesson flow (alarm when the app is quit, knocking after a restart, releasing a student).
// Run: npm run test:e2e   (builds the apps first)

import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.join(import.meta.dirname, '..');
const electronMain = 'dist/electron/UnPackaged/electron-main.js';
const teacherMain = path.join(repoRoot, 'teacher', electronMain);
const studentMain = path.join(repoRoot, 'student', electronMain);
const hostPort = '27522';

const shotDir = process.env.NC_E2E_SCREENSHOTS;

async function shot(page, name) {
  if (shotDir) await page.screenshot({ path: path.join(shotDir, `${name}.png`) });
}

async function getAppWindow(app) {
  await app.firstWindow();
  await expect.poll(() => app.windows().some((p) => p.url().startsWith('file:')), { timeout: 30_000 }).toBe(true);
  const page = app.windows().find((p) => p.url().startsWith('file:'));
  // devices with several networks ask once which one to use - possibly only after a few seconds
  // (seen on Windows CI runners): confirm the suggested network whenever the dialog shows up
  await page.addLocatorHandler(page.locator('.swal2-popup').filter({ has: page.locator('select.swal2-select') }), async (dialog) => {
    await dialog.locator('.swal2-confirm').click();
  });
  return page;
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

/** First start of the student app: first name, last name, class (entered once). */
async function completeStudentProfile(page, firstName, lastName, className = '3aHBT') {
  const dlg = page.locator('[data-e2e="profile-dialog"]');
  await expect(dlg).toBeVisible({ timeout: 15_000 });
  await expect(dlg.locator('[data-e2e="profile-first"]')).toHaveAttribute('placeholder', 'Maria');
  await dlg.locator('[data-e2e="profile-first"]').fill(firstName);
  await dlg.locator('[data-e2e="profile-last"]').fill(lastName);
  await dlg.locator('[data-e2e="profile-class"]').fill(className);
  await dlg.locator('[data-e2e="profile-save"]').click();
  await expect(dlg).toBeHidden();
}

async function confirmInterfacePicker(page) {
  const dialog = page.locator('.swal2-popup').filter({ has: page.locator('select.swal2-select') });
  if (await dialog.isVisible({ timeout: 4_000 }).catch(() => false)) {
    await dialog.locator('.swal2-confirm').click();
    await expect(dialog).toBeHidden();
  }
}



async function joinWithPin(student, pin) {
  const manual = student.locator('[data-e2e="manual-search"]');
  if (!(await manual.isChecked())) await manual.check();
  await student.locator('[data-e2e="server-ip"]').fill(`127.0.0.1:${hostPort}`);
  await expect(student.locator('[data-e2e="session-bp-ku"]')).toBeVisible({ timeout: 30_000 });
  await student.locator('[data-e2e="pin"]').fill(pin);
  await student.locator('[data-e2e="join"]').click();
}

test('lesson: alarm on quit, knock after restart, temporary and permanent release', async () => {
  test.setTimeout(240_000);
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'next-class-e2e-lesson-'));
  const env = (dir) => ({ ...process.env, DEBUG: '1', NXE_E2E_SERVER_API_PORT: hostPort, NEXT_CLASS_APPLOCK_FILE: path.join(profileRoot, `${dir}-applock.json`) });
  const launch = (main, dir) => electron.launch({ args: [`--user-data-dir=${path.join(profileRoot, dir)}`, main], cwd: path.dirname(path.dirname(path.dirname(path.dirname(main)))), env: env(dir) });
  const quit = async (app) => {
    await app?.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) w.allowexit = true; }).catch(() => {});
    await app?.close().catch(() => {});
  };
  let tApp, sApp;
  try {
    let t, s, pin;
    const card = () => t.locator('[data-e2e="student-Maria Musterschülerin"]');

    await test.step('lesson runs, Maria takes part', async () => {
      tApp = await launch(teacherMain, 'teacher');
      t = await getAppWindow(tApp);
      await confirmInterfacePicker(t);
      await completeWelcome(t, 'Herr Auer');
      await t.locator('[data-e2e="course-new"]').click();
      await t.locator('[data-e2e="course-name"]').fill('BP-KU');
      await t.locator('[data-e2e="course-save"]').click();
      await t.locator('[data-e2e="course-start-BP-KU"]').click();
      await expect(t.locator('[data-e2e="session-pin"]')).toHaveText(/^\d{6}$/, { timeout: 15_000 });
      pin = (await t.locator('[data-e2e="session-pin"]').textContent()).trim();
      sApp = await launch(studentMain, 'student');
      s = await getAppWindow(sApp);
      await confirmInterfacePicker(s);
      await completeStudentProfile(s, 'Maria', 'Musterschülerin');
      await joinWithPin(s, pin);
      await expect(s.locator('[data-e2e="connected-card"]')).toBeVisible({ timeout: 20_000 });
      await expect(card().locator('[data-e2e="badge-online"]')).toBeVisible({ timeout: 20_000 });
      await expect(card().locator('[data-e2e="badge-notjoined"]')).toHaveCount(0);
    });

    await test.step('Maria quits the app: alarm at the teacher', async () => {
      await quit(sApp);
      await expect(t.locator('[data-e2e="alarm-Maria Musterschülerin"]')).toBeVisible({ timeout: 20_000 });
      await shot(t, 'alarm-lehrer');
    });

    await test.step('app restarted: Maria knocks, the teacher lets her in again', async () => {
      sApp = await launch(studentMain, 'student');
      s = await getAppWindow(sApp);
      await confirmInterfacePicker(s);
      const manual = s.locator('[data-e2e="manual-search"]');
      if (!(await manual.isChecked())) await manual.check();
      await s.locator('[data-e2e="server-ip"]').fill(`127.0.0.1:${hostPort}`);   // network without multicast
      await expect(s.locator('[data-e2e="knock-pending"]')).toBeVisible({ timeout: 30_000 });
      await t.locator('[data-e2e="knock-admit-Maria Musterschülerin"]').click();
      await expect(s.locator('[data-e2e="connected-card"]')).toBeVisible({ timeout: 20_000 });
      await expect(t.locator('[data-e2e="alarm-Maria Musterschülerin"]')).toHaveCount(0, { timeout: 20_000 });
    });

    await test.step('temporary release, then release for the rest of the lesson', async () => {
      await card().locator('[data-e2e="release-Maria Musterschülerin"]').click();
      await t.locator('.swal2-confirm').click();
      await expect(card().locator('[data-e2e="badge-released"]')).toBeVisible({ timeout: 10_000 });
      await card().locator('[data-e2e="release-Maria Musterschülerin"]').click();
      await t.locator('.swal2-deny').click();
      await expect(s.locator('[data-e2e="released"]')).toBeVisible({ timeout: 20_000 });
      await expect(card().locator('[data-e2e="badge-absent"]')).toBeVisible({ timeout: 20_000 });
      await expect(s.locator('[data-e2e="connected-card"]')).toBeHidden();
      await shot(s, 'freigegeben-schueler');
    });
  } finally {
    await quit(sApp);
    await quit(tApp);
    await fs.rm(profileRoot, { recursive: true, force: true });
  }
});
