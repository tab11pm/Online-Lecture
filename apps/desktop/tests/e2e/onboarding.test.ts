import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication } from 'playwright';
import { expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mainEntry = join(repoRoot, 'apps', 'desktop', 'out', 'main', 'index.js');

// Opt-in only: plain `npm test` must stay green in headless CI without Electron.
const e2e = process.env.CI_ELECTRON_E2E === '1' ? it : it.skip;

e2e(
  'walks from welcome through credentials to the active session',
  async ({ skip }) => {
    if (!existsSync(mainEntry)) {
      skip(
        `Electron entry not found at ${mainEntry}; run "npm run build -w @online-lecture/desktop".`,
      );
      return;
    }

    let app: ElectronApplication | undefined;
    try {
      try {
        app = await electron.launch({
          args: [mainEntry],
          env: {
            ...process.env,
            ONLINE_LECTURE_FAKE_SESSION: '1',
            // Force the welcome screen to route through credentials first.
            ONLINE_LECTURE_FAKE_SESSION_EXPIRED: '1',
          },
        });
      } catch (error) {
        skip(`Electron could not launch here: ${describeError(error)}`);
        return;
      }

      const page = await app.firstWindow();

      const welcomeHeading = page.getByRole('heading', {
        name: 'Online Lecture',
      });
      await welcomeHeading.waitFor({ state: 'visible' });
      expect(await welcomeHeading.textContent()).toBe('Online Lecture');

      await page.getByRole('button', { name: 'Начать' }).click();

      const credentialsHeading = page.getByRole('heading', {
        name: 'Вход в ТУСУР',
      });
      await credentialsHeading.waitFor({ state: 'visible' });

      await page.getByLabel('Логин').fill('student');
      await page.getByLabel('Пароль').fill('fake-password');
      await page.getByRole('button', { name: 'Войти' }).click();

      const active = page.getByText('Сессия активна.');
      await active.waitFor({ state: 'visible', timeout: 30_000 });
      expect(await active.isVisible()).toBe(true);
    } finally {
      await app?.close();
    }
  },
);

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
