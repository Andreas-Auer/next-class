// End-to-end test: seating plan (place by drag and drop, swap, front/back view, kept for the next lesson).
// Run: npm run test:e2e   (builds the apps first)

import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.join(import.meta.dirname, '..');
const electronMain = 'dist/electron/UnPackaged/electron-main.js';
const teacherMain = path.join(repoRoot, 'teacher', electronMain);
const studentMain = path.join(repoRoot, 'student', electronMain);
const hostPort = '28522';

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

test('seating plan: drag students onto seats, swap, switch view, plan stays for the next lesson', async () => {
  test.setTimeout(240_000);
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'next-class-e2e-seating-'));
  const env = (dir) => ({ ...process.env, DEBUG: '1', NXE_E2E_SERVER_API_PORT: hostPort, NEXT_CLASS_APPLOCK_FILE: path.join(profileRoot, `${dir}-applock.json`) });
  const launch = (main, dir) => electron.launch({ args: [`--user-data-dir=${path.join(profileRoot, dir)}`, main], cwd: path.dirname(path.dirname(path.dirname(path.dirname(main)))), env: env(dir) });
  const quit = async (app) => {
    await app?.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) w.allowexit = true; }).catch(() => {});
    await app?.close().catch(() => {});
  };
  const apps = [];
  try {
    const tApp = await launch(teacherMain, 'teacher'); apps.push(tApp);
    const t = await getAppWindow(tApp);
    await confirmInterfacePicker(t);
    await completeWelcome(t, 'Herr Auer');
    await t.locator('[data-e2e="course-new"]').click();
    await t.locator('[data-e2e="course-name"]').fill('BP-KU');
    await t.locator('[data-e2e="course-save"]').click();
    await t.locator('[data-e2e="course-start-BP-KU"]').click();
    await expect(t.locator('[data-e2e="session-pin"]')).toHaveText(/^\d{6}$/, { timeout: 15_000 });
    const pin = (await t.locator('[data-e2e="session-pin"]').textContent()).trim();

    for (const [dir, first, last] of [['s1', 'Maria', 'Musterschülerin'], ['s2', 'Max', 'Muster']]) {
      const app = await launch(studentMain, dir); apps.push(app);
      const s = await getAppWindow(app);
      await confirmInterfacePicker(s);
      await completeStudentProfile(s, first, last);
      await joinWithPin(s, pin);
      await expect(s.locator('[data-e2e="connected-card"]')).toBeVisible({ timeout: 20_000 });
    }

    await test.step('place both students and swap them', async () => {
      await t.locator('[data-e2e="layout-seating"]').click();
      await expect(t.locator('[data-e2e="unseated-Maria Musterschülerin"]')).toBeVisible({ timeout: 15_000 });
      await t.locator('[data-e2e="unseated-Maria Musterschülerin"]').dragTo(t.locator('[data-e2e="seat-0-0"]'));
      await expect(t.locator('[data-e2e="seat-0-0"] [data-e2e="seated-Maria Musterschülerin"]')).toBeVisible();
      await t.locator('[data-e2e="unseated-Max Muster"]').dragTo(t.locator('[data-e2e="seat-0-1"]'));
      await expect(t.locator('[data-e2e="seat-0-1"] [data-e2e="seated-Max Muster"]')).toBeVisible();
      await t.locator('[data-e2e="seated-Maria Musterschülerin"]').dragTo(t.locator('[data-e2e="seat-0-1"]'));
      await expect(t.locator('[data-e2e="seat-0-1"] [data-e2e="seated-Maria Musterschülerin"]')).toBeVisible();
      await expect(t.locator('[data-e2e="seat-0-0"] [data-e2e="seated-Max Muster"]')).toBeVisible();
    });

    await test.step('aisle and view from the back', async () => {
      await t.locator('[data-e2e="seating-edit"]').click();
      await t.locator('[data-e2e="aisle-3"]').click();
      await expect(t.locator('[data-e2e="seat-0-3"]')).toHaveCount(0);
      await expect(t.locator('[data-e2e="seating-view"]')).toContainText('vorne');
      await t.locator('[data-e2e="seating-view"]').click();
      await expect(t.locator('[data-e2e="seating-view"]')).toContainText('hinten');
      await shot(t, 'sitzplan');
    });

    await test.step('next lesson opens with the seating plan', async () => {
      await t.locator('[data-e2e="session-end"]').click();
      await t.locator('.swal2-confirm').click();
      await t.locator('[data-e2e="course-start-BP-KU"]').click();
      await expect(t.locator('[data-e2e="seat-0-1"] [data-e2e="seated-Maria Musterschülerin"]')).toBeVisible({ timeout: 20_000 });
      await expect(t.locator('[data-e2e="seating-view"]')).toContainText('hinten');
    });
  } finally {
    for (const app of apps.reverse()) await quit(app);
    await fs.rm(profileRoot, { recursive: true, force: true });
  }
});
