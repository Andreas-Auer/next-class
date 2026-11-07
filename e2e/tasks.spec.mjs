// End-to-end test: tasks - material, submissions in the folder structure, copies for the second teacher.
// Run: npm run test:e2e   (builds the apps first)

import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.join(import.meta.dirname, '..');
const electronMain = 'dist/electron/UnPackaged/electron-main.js';
const teacherMain = path.join(repoRoot, 'teacher', electronMain);
const studentMain = path.join(repoRoot, 'student', electronMain);
const hostPort = '29522';
const coPort = '29622';

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

test('task: material download, submissions stored for both teachers without overwriting', async () => {
  test.setTimeout(240_000);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'next-class-e2e-tasks-'));
  const docs = (dir) => path.join(root, `${dir}-documents`);
  const env = (dir, port = hostPort) => ({
    ...process.env, DEBUG: '1', NXE_E2E_SERVER_API_PORT: port, NEXT_CLASS_APPLOCK_FILE: path.join(root, `${dir}-applock.json`),
    NEXT_CLASS_DOCUMENTS_DIR: docs(dir), NEXT_CLASS_DOWNLOADS_DIR: path.join(root, `${dir}-downloads`),
  });
  const launch = (main, dir, port) => electron.launch({ args: [`--user-data-dir=${path.join(root, dir)}`, main], cwd: path.dirname(path.dirname(path.dirname(path.dirname(main)))), env: env(dir, port) });
  const quit = async (app) => {
    await app?.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) w.allowexit = true; }).catch(() => {});
    await app?.close().catch(() => {});
  };
  // files the student hands in and the teacher hands out
  const work = path.join(root, 'work');
  await fs.mkdir(work);
  await fs.writeFile(path.join(work, 'Grundriss.pln'), 'version 1');
  await fs.writeFile(path.join(work, 'Ansicht.pdf'), Buffer.alloc(300_000, 7));
  await fs.mkdir(path.join(work, 'v2'));
  await fs.writeFile(path.join(work, 'v2', 'Grundriss.pln'), 'version 2');
  await fs.writeFile(path.join(work, 'Angabe.pdf'), 'Angabe');

  const apps = [];
  try {
    let a, b, s, pin, code, taskId, folderName;
    const studentDir = (dir) => path.join(docs(dir), 'Next-Class Abgaben', folderName, 'Musterschülerin Maria');

    await test.step('lesson with two teachers and Maria', async () => {
      const aApp = await launch(teacherMain, 'a', hostPort); apps.push(aApp);
      a = await getAppWindow(aApp);
      await confirmInterfacePicker(a);
      await completeWelcome(a, 'Herr Auer');
      await a.locator('[data-e2e="course-new"]').click();
      await a.locator('[data-e2e="course-name"]').fill('BP-KU');
      await a.locator('[data-e2e="course-save"]').click();
      await a.locator('[data-e2e="course-start-BP-KU"]').click();
      await expect(a.locator('[data-e2e="session-pin"]')).toHaveText(/^\d{6}$/, { timeout: 15_000 });
      pin = (await a.locator('[data-e2e="session-pin"]').textContent()).trim();
      code = (await a.locator('[data-e2e="teacher-code"]').textContent()).trim();

      const bApp = await launch(teacherMain, 'b', coPort); apps.push(bApp);
      b = await getAppWindow(bApp);
      await confirmInterfacePicker(b);
      await completeWelcome(b, 'Frau Huber');
      await b.locator('[data-e2e="cojoin-address"]').fill(`127.0.0.1:${hostPort}`);
      await b.locator('[data-e2e="cojoin-search"]').click();
      await b.locator('[data-e2e="cojoin-bp-ku"]').first().click();
      await b.locator('#co-code').fill(code);
      await b.locator('.swal2-confirm').click();
      await expect(a.locator('.swal2-html-container')).toContainText('Frau Huber', { timeout: 15_000 });
      await a.locator('.swal2-confirm').click();
      await expect(b.locator('[data-e2e="coteacher-leave"]')).toBeVisible({ timeout: 15_000 });

      const sApp = await launch(studentMain, 's', hostPort); apps.push(sApp);
      s = await getAppWindow(sApp);
      await confirmInterfacePicker(s);
      await completeStudentProfile(s, 'Maria', 'Musterschülerin');
      await joinWithPin(s, pin);
      await expect(s.locator('[data-e2e="connected-card"]')).toBeVisible({ timeout: 20_000 });
    });

    await test.step('teacher B sets the task "Grundriss EG" with material', async () => {
      await b.locator('[data-e2e="tasks-open"]').click();
      await b.locator('[data-e2e="task-new"]').click();
      await b.locator('[data-e2e="task-title"]').fill('Grundriss EG');
      await b.locator('[data-e2e="task-text"]').fill('Erdgeschoss zeichnen, als PLN und PDF abgeben.');
      await expect(b.locator('[data-e2e="task-folder"]')).toContainText('Next-Class Abgaben');
      await b.locator('[data-e2e="task-create"]').click();
      await expect(b.locator('[data-e2e="taskcard-Grundriss EG"]')).toBeVisible({ timeout: 15_000 });
      const tasks = await b.evaluate(() => window.ipcRenderer.invoke('remote-rpc', { method: 'taskList', args: 'bp-ku' }));
      taskId = tasks.result[0].id;
      folderName = tasks.result[0].folderName;
      expect(folderName).toMatch(/^\d{8}_BP-KU_Grundriss$/);
      const m = await b.evaluate(([id, file]) => window.ipcRenderer.invoke('task-add-material', { servername: 'bp-ku', taskId: id, paths: [file], remote: true }), [taskId, path.join(work, 'Angabe.pdf')]);
      expect(m.status).toBe('success');
    });

    await test.step('Maria downloads the material and hands in files', async () => {
      const task = s.locator('[data-e2e="task-Grundriss EG"]');
      await expect(task).toBeVisible({ timeout: 20_000 });
      await expect(task.locator('[data-e2e="material-Angabe.pdf"]')).toBeVisible({ timeout: 20_000 });
      await task.locator('[data-e2e="material-Angabe.pdf"]').click();
      await expect(s.locator('.swal2-title')).toHaveText('OK', { timeout: 15_000 });
      await s.locator('.swal2-confirm').click();
      expect(await fs.readFile(path.join(root, 's-downloads', 'Next-Class', folderName, 'Angabe.pdf'), 'utf8')).toBe('Angabe');

      const r1 = await s.evaluate(([id, files]) => window.ipcRenderer.invoke('submit-files', { taskId: id, paths: files }), [taskId, [path.join(work, 'Grundriss.pln'), path.join(work, 'Ansicht.pdf')]]);
      expect(r1.status).toBe('success');
      const r2 = await s.evaluate(([id, files]) => window.ipcRenderer.invoke('submit-files', { taskId: id, paths: files }), [taskId, [path.join(work, 'v2', 'Grundriss.pln')]]);
      expect(r2.status).toBe('success');
      await expect(task.locator('[data-e2e="submitted-Grundriss EG"]')).toContainText('3', { timeout: 15_000 });
      await shot(s, 'abgabe-schueler');
    });

    await test.step('files are in A\'s folder, nothing overwritten', async () => {
      const files = (await fs.readdir(studentDir('a'))).sort();
      expect(files).toEqual(['Ansicht.pdf', 'Grundriss (2).pln', 'Grundriss.pln']);
      expect(await fs.readFile(path.join(studentDir('a'), 'Grundriss.pln'), 'utf8')).toBe('version 1');
      expect(await fs.readFile(path.join(studentDir('a'), 'Grundriss (2).pln'), 'utf8')).toBe('version 2');
    });

    await test.step('teacher B gets copies in her own folder; both see who handed in', async () => {
      await expect.poll(async () => (await fs.readdir(studentDir('b')).catch(() => [])).sort(), { timeout: 30_000 })
        .toEqual(['Ansicht.pdf', 'Grundriss (2).pln', 'Grundriss.pln']);
      await expect(b.locator('[data-e2e="taskstate-Maria Musterschülerin-done"]')).toBeVisible({ timeout: 15_000 });
      await expect(b.locator('[data-e2e="tasklocal-Grundriss EG"]')).toContainText('3 von 3', { timeout: 15_000 });
      await a.locator('[data-e2e="tasks-open"]').click();
      await expect(a.locator('[data-e2e="taskstate-Maria Musterschülerin-done"]')).toBeVisible({ timeout: 15_000 });
      await shot(a, 'aufgaben-lehrer');
    });
  } finally {
    for (const app of apps.reverse()) await quit(app);
    await fs.rm(root, { recursive: true, force: true });
  }
});
