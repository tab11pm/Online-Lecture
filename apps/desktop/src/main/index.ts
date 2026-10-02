import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';
import { CHANNELS } from '../shared/ipc-contract.js';
import type { AppInfo, LoginInput } from '../shared/ipc-contract.js';
import type { LoginOutcome, OnboardingState } from '../shared/onboarding.js';
import { setAutostart as applyAutostart } from './autostart.js';
import { CoreProcess } from './core-process.js';
import { registerIpc } from './ipc.js';
import { resolveAppPaths } from './paths.js';
import { createSafeStorageBackend } from './safe-storage-backend.js';
import { SecretStore } from './secret-store.js';
import { SettingsStore } from './settings-store.js';
import { createTray } from './tray.js';
import { createMainWindow } from './window.js';

const startHidden = process.argv.includes('--hidden');

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
    },
    {
      onChanged: (state) => broadcast(CHANNELS.onboarding.changed, state),
      onStatusChanged: (status) =>
        broadcast(CHANNELS.core.statusChanged, status),
      onNotification: (message) =>
        broadcast(CHANNELS.core.notification, {
          level: 'error',
          message,
        }),
    },
  );
  const appCore = core;
  appCore.start();

  registerIpc({
    ipcMain,
    handlers: {
      [CHANNELS.onboarding.getState]: (): Promise<OnboardingState> =>
        appCore.getState(),
      [CHANNELS.onboarding.login]: (input: LoginInput): Promise<LoginOutcome> =>
        (async () => {
          await secretStore.save(input.password);
          await settingsStore.update({ username: input.username });
          return appCore.login(input);
        })(),
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
