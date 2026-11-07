// End-to-end test: enrollment (first lesson automatic, later lessons knock, enrolled devices join by themselves).
// Run: npm run test:e2e   (builds the apps first)

import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.join(import.meta.dirname, '..');
const electronMain = 'dist/electron/UnPackaged/electron-main.js';
const teacherMain = path.join(repoRoot, 'teacher', electronMain);
const studentMain = path.join(repoRoot, 'student', electronMain);
const hostPort = '26522';

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
  await page.addLocatorHandler(page.locator('.swal2-popup').filter({ has: page.locator('.swal2-title', { hasText: /^(Netzwerk auswählen|Select network)$/ }) }), async (dialog) => {
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

test('course enrollment: first lesson automatic, then automatic rejoin and knocking for new devices', async () => {
  test.setTimeout(240_000);
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'next-class-e2e-enroll-'));
  const env = (dir) => ({ ...process.env, DEBUG: '1', NXE_E2E_SERVER_API_PORT: hostPort, NEXT_CLASS_APPLOCK_FILE: path.join(profileRoot, `${dir}-applock.json`) });
  const launch = (main, dir) => electron.launch({ args: [`--user-data-dir=${path.join(profileRoot, dir)}`, main], cwd: path.dirname(path.dirname(path.dirname(path.dirname(main)))), env: env(dir) });
  let tApp, s1App, s2App;
  try {
    let t, s1, s2, pin;
    const card = (name) => t.locator(`[data-e2e="student-${name}"]`);
    const startLesson = async () => {
      await t.locator('[data-e2e="course-start-BP-KU"]').click();
      await expect(t.locator('[data-e2e="session-pin"]')).toHaveText(/^\d{6}$/, { timeout: 15_000 });
      return (await t.locator('[data-e2e="session-pin"]').textContent()).trim();
    };

    await test.step('teacher creates the course and starts lesson 1', async () => {
      tApp = await launch(teacherMain, 'teacher');
      t = await getAppWindow(tApp);
      await confirmInterfacePicker(t);
      await completeWelcome(t, 'Herr Auer');
      await t.locator('[data-e2e="course-new"]').click();
      await t.locator('[data-e2e="course-name"]').fill('BP-KU');
      await t.locator('[data-e2e="course-save"]').click();
      pin = await startLesson();
    });

    await test.step('lesson 1: Maria joins with the PIN and is enrolled automatically ("neu")', async () => {
      s1App = await launch(studentMain, 's1');
      s1 = await getAppWindow(s1App);
      await confirmInterfacePicker(s1);
      await completeStudentProfile(s1, 'Maria', 'Musterschülerin');
      await joinWithPin(s1, pin);
      await expect(s1.locator('[data-e2e="connected-card"]')).toBeVisible({ timeout: 20_000 });
      await expect(card('Maria Musterschülerin').locator('[data-e2e="badge-new"]')).toBeVisible({ timeout: 20_000 });
    });

    await test.step('lesson 2: Maria joins by herself, the PIN stays the same', async () => {
      await t.locator('[data-e2e="session-end"]').click();
      await t.locator('.swal2-confirm').click();
      await expect(t.locator('[data-e2e="course-BP-KU"]')).toBeVisible({ timeout: 15_000 });
      await expect(s1.locator('[data-e2e="connected-card"]')).toBeHidden({ timeout: 40_000 });
      await expect(s1.locator('[data-e2e="mycourse-BP-KU"]')).toBeVisible();
      expect(await startLesson()).toBe(pin);
      await expect(s1.locator('[data-e2e="connected-card"]')).toBeVisible({ timeout: 40_000 });   // no click
      await expect(card('Maria Musterschülerin').locator('[data-e2e="badge-online"]')).toBeVisible({ timeout: 20_000 });
      await expect(card('Maria Musterschülerin').locator('[data-e2e="badge-new"]')).toHaveCount(0);
      // joined by itself = only connected; "Am Unterricht teilnehmen" makes her take part
      await expect(card('Maria Musterschülerin').locator('[data-e2e="badge-notjoined"]')).toBeVisible({ timeout: 15_000 });
      await s1.locator('[data-e2e="participate"]').click();
      await expect(card('Maria Musterschülerin').locator('[data-e2e="badge-notjoined"]')).toHaveCount(0, { timeout: 15_000 });
    });

    await test.step('lesson 2: a new device knocks and the teacher lets it in', async () => {
      s2App = await launch(studentMain, 's2');
      s2 = await getAppWindow(s2App);
      await confirmInterfacePicker(s2);
      await completeStudentProfile(s2, 'Max', 'Muster', '3bHBT');
      await joinWithPin(s2, pin);
      await expect(s2.locator('[data-e2e="knock-pending"]')).toBeVisible({ timeout: 20_000 });
      await shot(s2, 'anklopfen-schueler');
      await expect(t.locator('[data-e2e="knock-Max Muster"]')).toBeVisible({ timeout: 20_000 });
      await shot(t, 'anklopfen-lehrer');
      await t.locator('[data-e2e="knock-admit-Max Muster"]').click();
      await expect(s2.locator('[data-e2e="connected-card"]')).toBeVisible({ timeout: 20_000 });
      await expect(card('Max Muster').locator('[data-e2e="badge-new"]')).toBeVisible({ timeout: 20_000 });
    });

    await test.step('after the lesson Max removes the course from "Meine Kurse"', async () => {
      await t.locator('[data-e2e="session-end"]').click();
      await t.locator('.swal2-confirm').click();
      await expect(s2.locator('[data-e2e="connected-card"]')).toBeHidden({ timeout: 40_000 });
      await expect(s2.locator('[data-e2e="mycourse-remove-BP-KU"]')).toBeVisible({ timeout: 20_000 });   // only when not live
      await s2.locator('[data-e2e="mycourse-remove-BP-KU"]').click();
      await s2.locator('.swal2-confirm').click();
      await expect(s2.locator('[data-e2e="mycourse-BP-KU"]')).toHaveCount(0);
      await expect(s1.locator('[data-e2e="mycourse-BP-KU"]')).toBeVisible();   // other devices keep it
    });
  } finally {
    for (const app of [s2App, s1App, tApp]) {
      await app?.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) w.allowexit = true; }).catch(() => {});
      await app?.close().catch(() => {});
    }
    await fs.rm(profileRoot, { recursive: true, force: true });
  }
});
