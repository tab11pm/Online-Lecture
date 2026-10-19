import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication } from 'playwright';

export const repoRoot = fileURLToPath(
  new URL('../../../../../', import.meta.url),
);
const desktopRoot = join(repoRoot, 'apps', 'desktop');
export const mainEntry = join(desktopRoot, 'out', 'main', 'index.js');

export type ElectronLaunchMode =
  { kind: 'development' } | { kind: 'packaged'; executablePath: string };

/**
 * Chooses the Electron runtime for the E2E harness. Packaged runs require an
 * explicit Windows executable; there is no fallback to the development build.
 */
export function resolveLaunchMode(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): ElectronLaunchMode {
  const configured = env.ONLINE_LECTURE_PACKAGED_EXECUTABLE?.trim();
  if (!configured) {
    return { kind: 'development' };
  }
  if (platform !== 'win32') {
    throw new Error(
      'ONLINE_LECTURE_PACKAGED_EXECUTABLE is supported only on Windows.',
    );
  }
  if (!isAbsolute(configured)) {
    throw new Error(
      'ONLINE_LECTURE_PACKAGED_EXECUTABLE must be an absolute path.',
    );
  }
  if (!existsSync(configured)) {
    throw new Error(
      'ONLINE_LECTURE_PACKAGED_EXECUTABLE does not point to an existing file.',
    );
  }
  return { kind: 'packaged', executablePath: configured };
}

const DEVELOPER_RUNTIME_VARIABLES = [
  'NODE_PATH',
  'NODE_OPTIONS',
  'ELECTRON_RUN_AS_NODE',
  'SDO_MCP_SERVER_PATH',
  'SDO_MCP_SERVER_CWD',
] as const;

/** Removes developer-only resolution hooks from a packaged child environment. */
export function sanitizePackagedEnvironment(
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const next = { ...env };
  for (const key of DEVELOPER_RUNTIME_VARIABLES) {
    delete next[key];
  }
  return next;
}

export async function launchIsolatedElectron(
  scenarioEnv: Record<string, string> = {},
): Promise<{ app: ElectronApplication; close(): Promise<void> }> {
  const mode = resolveLaunchMode(process.env, process.platform);
  if (mode.kind === 'development' && !existsSync(mainEntry)) {
    throw new Error(
      `Electron E2E build is missing at ${mainEntry}. Run "npm run build -w @online-lecture/desktop" before setting CI_ELECTRON_E2E=1.`,
    );
  }

  const dataDir = mkdtempSync(join(tmpdir(), 'online-lecture-e2e-'));
  const profileDir = join(dataDir, 'profile');
  const baseEnv =
    mode.kind === 'packaged'
      ? sanitizePackagedEnvironment(process.env)
      : { ...process.env };
  const launchEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (value !== undefined) launchEnv[key] = value;
  }
  Object.assign(launchEnv, {
    ONLINE_LECTURE_FAKE_SSO: '',
    ONLINE_LECTURE_FAKE_RUN_FAILURE: '0',
    ONLINE_LECTURE_FAKE_EDIT_SCENARIO: '0',
    ...scenarioEnv,
    ONLINE_LECTURE_FAKE_SESSION: '1',
    ONLINE_LECTURE_FAKE_SESSION_EXPIRED: '1',
    LOCALAPPDATA: dataDir,
  });

  let app: ElectronApplication;
  try {
    app = await electron.launch({
      ...(mode.kind === 'packaged'
        ? { executablePath: mode.executablePath, cwd: dataDir }
        : {}),
      // Development launches the package so app.getAppPath() locates its
      // native SQLite build. Packaged runs already carry their own resources.
      args:
        mode.kind === 'packaged'
          ? [`--user-data-dir=${profileDir}`]
          : [desktopRoot, `--user-data-dir=${profileDir}`],
      env: launchEnv,
    });
  } catch (error) {
    rmSync(dataDir, { recursive: true, force: true });
    const detail = error instanceof Error ? error.message : String(error);
    const hint =
      mode.kind === 'packaged'
        ? 'Check the packaged resources and that the executable is a Windows build.'
        : 'Check that the Electron runtime and required Playwright Chromium/headless shell are installed.';
    throw new Error(
      `Could not launch Electron for the opt-in E2E run. ${hint} Original error: ${detail}`,
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
