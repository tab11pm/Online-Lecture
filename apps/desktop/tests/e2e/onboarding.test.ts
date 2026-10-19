import { expect, it } from 'vitest';
import { launchIsolatedElectron } from './support/electron-app.js';

// Opt-in only: plain `npm test` must stay green in headless CI without Electron.
const e2e = process.env.CI_ELECTRON_E2E === '1' ? it : it.skip;

e2e(
  'walks from welcome through credentials to the active session',
  async () => {
    const isolated = await launchIsolatedElectron({
      // Force the welcome screen to route through credentials first.
      ONLINE_LECTURE_FAKE_SESSION_EXPIRED: '1',
    });
    try {
      const page = await isolated.app.firstWindow();

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
      await isolated.close();
    }
  },
  120_000,
);
