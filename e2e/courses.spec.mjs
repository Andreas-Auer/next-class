// End-to-end test: courses (fixed PIN, presets, shared between teachers, joining without approval).
// Run: npm run test:e2e   (builds the apps first)

import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.join(import.meta.dirname, '..');
const electronMain = 'dist/electron/UnPackaged/electron-main.js';
const teacherMain = path.join(repoRoot, 'teacher', electronMain);
const studentMain = path.join(repoRoot, 'student', electronMain);
const hostPort = '25522';
const coPort = '25622';
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

async function confirmInterfacePicker(page) {
  const dialog = page.locator('.swal2-popup').filter({ has: page.locator('select.swal2-select') });
  if (await dialog.isVisible({ timeout: 4_000 }).catch(() => false)) {
    await dialog.locator('.swal2-confirm').click();
    await expect(dialog).toBeHidden();
  }
}


test('course: create, start with presets, second teacher joins once with code and then directly', async () => {
  test.setTimeout(180_000);
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'next-class-e2e-course-'));
  const launch = (dir, port) => electron.launch({
    args: [`--user-data-dir=${path.join(profileRoot, dir)}`, teacherMain],
    cwd: path.join(repoRoot, 'teacher'),
    env: { ...process.env, DEBUG: '1', NXE_E2E_SERVER_API_PORT: port, NEXT_CLASS_APPLOCK_FILE: path.join(profileRoot, `${dir}-applock.json`) },
  });
  let aApp, bApp;
  try {
    let a, b, teacherCode;

    await test.step('teacher A creates the course BP-KU', async () => {
      aApp = await launch('a', hostPort);
      a = await getAppWindow(aApp);
      await confirmInterfacePicker(a);
      await completeWelcome(a, 'Herr Auer');
      await a.locator('[data-e2e="course-new"]').click();
      const dlg = a.locator('[data-e2e="course-settings"]');
      await dlg.locator('[data-e2e="course-name"]').fill('BP-KU');
      await dlg.locator('[data-e2e="course-start"]').fill('00:00');
      await dlg.locator('[data-e2e="course-end"]').fill('23:59');
      await dlg.locator('[data-e2e="course-exceptions"]').fill('lizenz.schule.at');
      await expect(dlg.locator('[data-e2e="folder-path"]')).toContainText('Next-Class Abgaben');
      await dlg.locator('[data-e2e="course-save"]').click();
      const tile = a.locator('[data-e2e="course-BP-KU"]');
      await expect(tile).toBeVisible();
      await expect(tile).toContainText('Herr Auer');
      await expect(tile).toContainText('00:00 – 23:59');
      await shot(a, 'kurs-1-kacheln');
    });

    await test.step('A starts the lesson: 6-digit course PIN, end time and exceptions preset', async () => {
      await a.locator('[data-e2e="course-start-BP-KU"]').click();
      await expect(a.locator('[data-e2e="session-pin"]')).toHaveText(/^\d{6}$/, { timeout: 15_000 });
      await expect(a.locator('[data-e2e="netlock-time"]')).toHaveValue('23:59');
      await expect(a.locator('[data-e2e="netlock-exceptions"]')).toHaveValue(/lizenz\.schule\.at/);
      teacherCode = (await a.locator('[data-e2e="teacher-code"]').textContent()).trim();
    });

    await test.step('teacher B joins once with teacher code and approval', async () => {
      bApp = await launch('b', coPort);
      b = await getAppWindow(bApp);
      await confirmInterfacePicker(b);
      await completeWelcome(b, 'Frau Huber');
      await b.locator('[data-e2e="cojoin-address"]').fill(`127.0.0.1:${hostPort}`);
      await b.locator('[data-e2e="cojoin-search"]').click();
      await b.locator('[data-e2e="cojoin-bp-ku"]').first().click();
      await b.locator('#co-code').fill(teacherCode);
      await b.locator('.swal2-confirm').click();
      await expect(a.locator('.swal2-html-container')).toContainText('Frau Huber', { timeout: 15_000 });
      await a.locator('.swal2-confirm').click();
      await expect(b.locator('[data-e2e="coteacher-leave"]')).toBeVisible({ timeout: 15_000 });
    });

    await test.step('B now has the course; leaving and starting it again joins directly', async () => {
      await b.locator('[data-e2e="coteacher-leave"]').click();
      const tile = b.locator('[data-e2e="course-BP-KU"]');
      await expect(tile).toBeVisible({ timeout: 15_000 });
      await expect(tile).toContainText('Herr Auer');
      await expect(tile).toContainText('Frau Huber');
      await b.locator('[data-e2e="cojoin-address"]').fill(`127.0.0.1:${hostPort}`);
      await b.locator('[data-e2e="cojoin-search"]').click();
      await expect(b.locator('[data-e2e="course-live-BP-KU"]')).toBeVisible({ timeout: 15_000 });
      await shot(b, 'kurs-2-live');
      await b.locator('[data-e2e="course-start-BP-KU"]').click();
      await expect(b.locator('[data-e2e="coteacher-leave"]')).toBeVisible({ timeout: 15_000 });   // no approval needed
      await expect(b.locator('[data-e2e="teacher-Herr Auer"]')).toBeVisible({ timeout: 10_000 });
      await expect(a.locator('[data-e2e="teacher-Frau Huber"]')).toBeVisible({ timeout: 10_000 });
    });

    await test.step('B changes the course without a lesson together: A gets the change by itself', async () => {
      await b.locator('[data-e2e="coteacher-leave"]').click();
      await b.locator('[data-e2e="course-edit-BP-KU"]').click();
      const dlg = b.locator('[data-e2e="course-settings"]');
      await dlg.locator('[data-e2e="course-start"]').fill('08:00');
      await dlg.locator('[data-e2e="course-end"]').fill('09:40');
      await dlg.locator('[data-e2e="course-save"]').click();
      await expect(b.locator('[data-e2e="course-BP-KU"]')).toContainText('08:00 – 09:40');
      // A is not in a lesson with B any more: the course sync on the LAN brings the change over
      const aCourses = path.join(profileRoot, 'a', 'courses.json');
      await expect.poll(async () => (await fs.readFile(aCourses, 'utf8').catch(() => '')).includes('09:40'), { timeout: 40_000 }).toBe(true);
    });
  } finally {
    for (const app of [bApp, aApp]) {
      await app?.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) w.allowexit = true; }).catch(() => {});
      await app?.close().catch(() => {});
    }
    await fs.rm(profileRoot, { recursive: true, force: true });
  }
});
