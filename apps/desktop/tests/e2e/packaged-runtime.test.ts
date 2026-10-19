import { expect, it } from 'vitest';
import { smokePackagedRuntime } from '../../scripts/packaged-runtime-smoke.js';
import {
  launchIsolatedElectron,
  resolveLaunchMode,
} from './support/electron-app.js';
import { runPackagedRuntimeSmokeForE2E } from './support/packaged-runtime-smoke.js';

// This opt-in check runs the bundled runtime smoke before packaged UI checks.
const packaged = process.env.ONLINE_LECTURE_PACKAGED_EXECUTABLE ? it : it.skip;

packaged(
  'runs the packaged executable with its own application resources',
  async () => {
    const executablePath = process.env.ONLINE_LECTURE_PACKAGED_EXECUTABLE;
    if (!executablePath) throw new Error('packaged executable is required');
    const mode = resolveLaunchMode(process.env, process.platform);
    if (mode.kind !== 'packaged')
      throw new Error('packaged executable is required');
    await runPackagedRuntimeSmokeForE2E(
      mode.executablePath,
      smokePackagedRuntime,
    );
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
