import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain, utilityProcess } from 'electron';
import { CHANNELS } from '../shared/ipc-contract.js';
import type { AppInfo, LoginInput } from '../shared/ipc-contract.js';
import type { LoginOutcome, OnboardingState } from '../shared/onboarding.js';
import { setAutostart as applyAutostart } from './autostart.js';
import { CoreProcess } from './core-process.js';
import { registerIpc } from './ipc.js';
import {
  applyDesktopServerDefaults,
  findWorkspaceRoot,
  loadEnvFiles,
} from './load-env.js';
import { createLoginHandler } from './login-handler.js';
import { resolveAppPaths, resolveDataRoot } from './paths.js';
import { createSafeStorageBackend } from './safe-storage-backend.js';
import { SecretStore } from './secret-store.js';
import { SettingsStore } from './settings-store.js';
import { createTray } from './tray.js';
import { createMainWindow } from './window.js';

// Load the SDO MCP configuration (SDO_MCP_SERVER_PATH, SDO_MCP_SERVER_CWD, …)
// before forking the worker, which inherits this environment. The desktop app
// runs from `apps/desktop`, so depending on the process CWD would miss the
// repository-root `.env` documented in the README; load the app directory and
// workspace root as well. Files are optional; packaged mode configures the
// server another way (phase 4).
const appPath = app.getAppPath();
const workspaceRoot =
  findWorkspaceRoot(appPath) ?? findWorkspaceRoot(process.cwd());
loadEnvFiles([
  appPath,
  process.cwd(),
  ...(workspaceRoot ? [workspaceRoot] : []),
]);
applyDesktopServerDefaults(process.env, process.platform);

const startHidden = process.argv.includes('--hidden');

// Keep all app data under the per-user Local app data root on Windows, not the
// roaming profile. Must run before `whenReady` (and before sessionData is used).
const appDataRoot = resolveDataRoot();
try {
  mkdirSync(appDataRoot, { recursive: true });
  app.setPath('userData', appDataRoot);
} catch {
  // Keep Electron's default userData if the Local root cannot be prepared.
}

let mainWindow: BrowserWindow | undefined;
let tray: ReturnType<typeof createTray> | undefined;
let core: CoreProcess | undefined;
let isQuitting = false;

async function getAppInfo(): Promise<AppInfo> {
  return {
    version: app.getVersion(),
    autostart: app.getLoginItemSettings().openAtLogin,
  };
}

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload);
  }
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow({
      rendererUrl: process.env['ELECTRON_RENDERER_URL'],
      hidden: false,
      isQuitting: () => isQuitting,
    });
  }
  mainWindow.show();
  mainWindow.focus();
}

void app.whenReady().then(async () => {
  const paths = resolveAppPaths();
  const secretStore = new SecretStore(
    paths.credentials,
    createSafeStorageBackend(),
  );
  const settingsStore = new SettingsStore(paths.settings);
  const settings = await settingsStore.read();
  applyAutostart(app, settings.autostart);

  core = new CoreProcess(
    {
      entryPath: fileURLToPath(new URL('./entry.js', import.meta.url)),
      userDataDir: paths.root,
      fork: (entryPath, args) => utilityProcess.fork(entryPath, args),
    },
    {
      onChanged: (state) => broadcast(CHANNELS.onboarding.changed, state),
      onStatusChanged: (status) =>
        broadcast(CHANNELS.core.statusChanged, status),
      onNotification: (notification) =>
        broadcast(CHANNELS.core.notification, notification),
    },
  );
  const appCore = core;
  appCore.start();
  const handleLogin = createLoginHandler({
    secretStore,
    settingsStore,
    core: appCore,
  });

  registerIpc({
    ipcMain,
    handlers: {
      [CHANNELS.onboarding.getState]: (): Promise<OnboardingState> =>
        appCore.getState(),
      [CHANNELS.onboarding.login]: (input: LoginInput): Promise<LoginOutcome> =>
        handleLogin(input),
      [CHANNELS.onboarding.openManualSso]: (): Promise<LoginOutcome> =>
        appCore.openManualSso(),
      [CHANNELS.onboarding.checkSession]: (): Promise<OnboardingState> =>
        appCore.checkSession(),
      [CHANNELS.app.getInfo]: (): Promise<AppInfo> => getAppInfo(),
      [CHANNELS.app.setAutostart]: async (
        enabled: boolean,
      ): Promise<AppInfo> => {
        const next = await settingsStore.update({ autostart: enabled });
        const applied = applyAutostart(app, next.autostart);
        if (applied !== next.autostart) {
          await settingsStore.update({ autostart: applied });
        }
        return getAppInfo();
      },
      [CHANNELS.app.quit]: (): Promise<void> => {
        isQuitting = true;
        app.quit();
        return Promise.resolve();
      },
      [CHANNELS.core.getStatus]: () => appCore.getStatus(),
      [CHANNELS.core.start]: () => appCore.start(),
      [CHANNELS.core.stop]: () => appCore.stop(),
    },
  });

  mainWindow = createMainWindow({
    rendererUrl: process.env['ELECTRON_RENDERER_URL'],
    hidden: startHidden,
    isQuitting: () => isQuitting,
  });
  tray = createTray({
    tooltip: 'Online Lecture',
    onOpen: showMainWindow,
    onQuit: () => {
      isQuitting = true;
      app.quit();
    },
  });
});

app.on('activate', () => {
  showMainWindow();
});

app.on('before-quit', () => {
  isQuitting = true;
  tray?.destroy();
  core?.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
