import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication } from 'playwright';

export const repoRoot = fileURLToPath(
  new URL('../../../../../', import.meta.url),
);
const desktopRoot = join(repoRoot, 'apps', 'desktop');
export const mainEntry = join(desktopRoot, 'out', 'main', 'index.js');

export async function launchIsolatedElectron(
  scenarioEnv: Record<string, string> = {},
): Promise<{ app: ElectronApplication; close(): Promise<void> }> {
  if (!existsSync(mainEntry)) {
    throw new Error(
      `Electron E2E build is missing at ${mainEntry}. Run "npm run build -w @online-lecture/desktop" before setting CI_ELECTRON_E2E=1.`,
    );
  }

  const dataDir = mkdtempSync(join(tmpdir(), 'online-lecture-e2e-'));
  let app: ElectronApplication;
  try {
    app = await electron.launch({
      // Launch the package so app.getAppPath() locates its native SQLite build.
      args: [desktopRoot, `--user-data-dir=${join(dataDir, 'profile')}`],
      env: {
        ...process.env,
        ONLINE_LECTURE_FAKE_SSO: '',
        ONLINE_LECTURE_FAKE_RUN_FAILURE: '0',
        ONLINE_LECTURE_FAKE_EDIT_SCENARIO: '0',
        ...scenarioEnv,
        ONLINE_LECTURE_FAKE_SESSION: '1',
        ONLINE_LECTURE_FAKE_SESSION_EXPIRED: '1',
        LOCALAPPDATA: dataDir,
      },
    });
  } catch (error) {
    rmSync(dataDir, { recursive: true, force: true });
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not launch Electron for the opt-in E2E run. Check that the Electron runtime and required Playwright Chromium/headless shell are installed. Original error: ${detail}`,
      { cause: error },
    );
  }

  return {
    app,
    async close() {
      try {
        await app.close();
      } finally {
        rmSync(dataDir, { recursive: true, force: true });
      }
    },
  };
}
