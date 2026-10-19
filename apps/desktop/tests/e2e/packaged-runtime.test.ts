import { expect, it } from 'vitest';
import { launchIsolatedElectron } from './support/electron-app.js';

// Packaged UI coverage reuses the four existing fake-session scenarios; this
// opt-in check only asserts that the harness launched the real package.
const packaged = process.env.ONLINE_LECTURE_PACKAGED_EXECUTABLE ? it : it.skip;

packaged(
  'runs the packaged executable with its own application resources',
  async () => {
    const isolated = await launchIsolatedElectron();
    try {
      const isPackaged = await isolated.app.evaluate(
        ({ app }) => app.isPackaged,
      );
      expect(isPackaged).toBe(true);
      const page = await isolated.app.firstWindow();
      await page
        .getByRole('heading', { name: 'Online Lecture' })
        .waitFor({ state: 'visible' });
    } finally {
      await isolated.close();
    }
  },
  180_000,
);
