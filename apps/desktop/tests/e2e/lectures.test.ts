import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication } from 'playwright';
import { expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mainEntry = join(repoRoot, 'apps', 'desktop', 'out', 'main', 'index.js');

// Opt-in only: plain `npm test` must stay green in headless CI without Electron.
const e2e = process.env.CI_ELECTRON_E2E === '1' ? it : it.skip;

e2e(
  'attends the demo lecture and records a manual stop',
  async ({ skip }) => {
    if (!existsSync(mainEntry)) {
      skip(
        `Electron entry not found at ${mainEntry}; run "npm run build -w @online-lecture/desktop".`,
      );
      return;
    }

    const dataDir = mkdtempSync(join(tmpdir(), 'online-lecture-e2e-'));
    let app: ElectronApplication | undefined;
    try {
      try {
        app = await electron.launch({
          args: [mainEntry, `--user-data-dir=${dataDir}`],
          env: {
            ...process.env,
            ONLINE_LECTURE_FAKE_SESSION: '1',
            ONLINE_LECTURE_FAKE_SESSION_EXPIRED: '1',
            LOCALAPPDATA: dataDir,
          },
        });
      } catch (error) {
        skip(`Electron could not launch here: ${describeError(error)}`);
        return;
      }

      const page = await app.firstWindow();

      await page
        .getByRole('heading', { name: 'Online Lecture' })
        .waitFor({ state: 'visible' });
      await page.getByRole('button', { name: 'Начать' }).click();
      await page
        .getByRole('heading', { name: 'Вход в ТУСУР' })
        .waitFor({ state: 'visible' });
      await page.getByLabel('Логин').fill('student');
      await page.getByLabel('Пароль').fill('fake-password');
      await page.getByRole('button', { name: 'Войти' }).click();

      const current = page.getByText(
        /Сейчас идёт: Демонстрационная лекция, до \d{2}:\d{2}/,
      );
      await current.waitFor({ state: 'visible', timeout: 90_000 });
      await page
        .getByText('Состояние: подключено')
        .waitFor({ state: 'visible', timeout: 60_000 });

      await page.getByRole('button', { name: 'Остановить' }).click();

      const lastRun = page.getByText(
        /Последний запуск: Демонстрационная лекция — завершена, остановлено вручную/,
      );
      await lastRun.waitFor({ state: 'visible', timeout: 60_000 });
      expect(await lastRun.isVisible()).toBe(true);
    } finally {
      await app?.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  },
  240_000,
);

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
