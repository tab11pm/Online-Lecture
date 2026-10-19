import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  app,
  BrowserWindow,
  ipcMain,
  Notification,
  powerMonitor,
  utilityProcess,
} from 'electron';
import { CHANNELS } from '../shared/ipc-contract.js';
import type { AppInfo, LoginInput } from '../shared/ipc-contract.js';
import type { LoginOutcome, OnboardingState } from '../shared/onboarding.js';
import type { BrowserChoice } from '../shared/browser-choice.js';
import { startApplicationInstance } from './application-instance.js';
import { setAutostart as applyAutostart } from './autostart.js';
import { CoreProcess } from './core-process.js';
import { DesktopNotifier } from './desktop-notifier.js';
import { BrowserController } from './browser-controller.js';
import { ChromiumInstaller } from './chromium-installer.js';
import { registerIpc } from './ipc.js';
import { applyDesktopServerDefaults } from './load-env.js';
import { createLoginHandler } from './login-handler.js';
import { resolveAppPaths, resolveDataRoot } from './paths.js';
import {
  externalBrowserChannelForRuntime,
  initializeRuntimeEnvironment,
} from './runtime-policy.js';
import { createSafeStorageBackend } from './safe-storage-backend.js';
import { SecretStore } from './secret-store.js';
import { SettingsStore } from './settings-store.js';
import { QuitController } from './quit-state.js';
import { createTray } from './tray.js';
import { trayStateFromView } from './tray-state.js';
import { createMainWindow } from './window.js';

// Establish the trusted runtime mode before reading configuration or forking
// the worker. Development loads `.env` from the app/workspace; packaged builds
// never read env files and pin SQLite to the shipped native module.
const appPath = app.getAppPath();
const runtimeMode = initializeRuntimeEnvironment(
  {
    isPackaged: app.isPackaged,
    appPath,
    resourcesPath: process.resourcesPath,
    cwd: process.cwd(),
    platform: process.platform,
  },
  process.env,
);
const externalBrowserChannel = externalBrowserChannelForRuntime(
  runtimeMode,
  process.env,
);

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
let journalOpenPending = false;
const quit = new QuitController();

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
      isQuitting: () => quit.isQuitting(),
    });
  }
  mainWindow.show();
  mainWindow.focus();
}

const notifier = new DesktopNotifier(
  (options) => new Notification(options),
  () => {
    journalOpenPending = true;
    showMainWindow();
    broadcast(CHANNELS.journal.open, undefined);
  },
);

function startPrimary(markReady: () => void): void {
  void app.whenReady().then(async () => {
    const paths = resolveAppPaths();
    const secretStore = new SecretStore(
      paths.credentials,
      createSafeStorageBackend(),
    );
    const settingsStore = new SettingsStore(paths.settings);
    const settings = await settingsStore.read();
    const initialBrowserChoice =
      settings.browser ?? (process.platform === 'win32' ? 'edge' : 'chromium');
    applyDesktopServerDefaults(
      process.env,
      process.platform,
      initialBrowserChoice,
    );
    applyAutostart(app, settings.autostart);

    core = new CoreProcess(
      {
        entryPath: fileURLToPath(new URL('./entry.js', import.meta.url)),
        userDataDir: paths.root,
        initialBrowserChoice,
        initialShowLectureWindow: settings.showLectureWindow ?? true,
        externalChannel: externalBrowserChannel,
        runtimeMode,
        fork: (entryPath, args) => utilityProcess.fork(entryPath, args),
      },
      {
        onChanged: (state) => broadcast(CHANNELS.onboarding.changed, state),
        onStatusChanged: (status) =>
          broadcast(CHANNELS.core.statusChanged, status),
        onNotification: (notification) =>
          broadcast(CHANNELS.core.notification, notification),
        onLecturesChanged: (view) => {
          broadcast(CHANNELS.lectures.changed, view);
          tray?.update(trayStateFromView(view));
        },
        onJournalEvent: (event) => notifier.show(event),
      },
    );
    const appCore = core;
    appCore.start();
    powerMonitor.on('resume', () => appCore.systemResumed());
    const installer = new ChromiumInstaller({
      onChanged: () => {
        void browserController
          .getBrowser()
          .then((view) => broadcast(CHANNELS.app.browserChanged, view));
      },
    });
    const browserController = new BrowserController({
      settings: settingsStore,
      installer,
      core: appCore,
      platform: process.platform,
      externalChannel: externalBrowserChannel,
      onChanged: (view) => broadcast(CHANNELS.app.browserChanged, view),
    });
    const browser = browserController;
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
        [CHANNELS.onboarding.login]: async (
          input: LoginInput,
        ): Promise<LoginOutcome> => {
          await browser.assertReady();
          return handleLogin(input);
        },
        [CHANNELS.onboarding.openManualSso]:
          async (): Promise<LoginOutcome> => {
            await browser.assertReady();
            return appCore.openManualSso();
          },
        [CHANNELS.onboarding.checkSession]:
          async (): Promise<OnboardingState> => {
            await browser.assertReady();
            return appCore.checkSession();
          },
        [CHANNELS.app.getInfo]: (): Promise<AppInfo> => getAppInfo(),
        [CHANNELS.app.getBrowser]: () => browser.getBrowser(),
        [CHANNELS.app.setBrowser]: (choice: BrowserChoice) =>
          browser.setBrowser(choice),
        [CHANNELS.app.installChromium]: () => browser.installChromium(),
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
          app.quit();
          return Promise.resolve();
        },
        [CHANNELS.app.getShowLectureWindow]: async (): Promise<boolean> =>
          (await settingsStore.read()).showLectureWindow ?? true,
        [CHANNELS.app.setShowLectureWindow]: async (
          show: boolean,
        ): Promise<boolean> => {
          const next = await settingsStore.update({
            showLectureWindow: show === true,
          });
          const value = next.showLectureWindow ?? true;
          appCore.setShowLectureWindow(value);
          return value;
        },
        [CHANNELS.lectures.getView]: () => appCore.getLecturesView(),
        [CHANNELS.lectures.importNow]: (): Promise<void> => {
          appCore.importLectures();
          return Promise.resolve();
        },
        [CHANNELS.lectures.stopCurrent]: (): Promise<void> => {
          appCore.stopCurrentLecture();
          return Promise.resolve();
        },
        [CHANNELS.lectures.setSkipped]: (
          jobId: string,
          occurrenceId: string,
          skipped: boolean,
        ): Promise<void> => {
          appCore.setLectureSkipped(jobId, occurrenceId, skipped === true);
          return Promise.resolve();
        },
        [CHANNELS.lectures.resolveManualTarget]: (query: string) =>
          appCore.resolveManualTarget(query),
        [CHANNELS.lectures.saveManual]: (
          input: Parameters<CoreProcess['saveManual']>[0],
        ) => appCore.saveManual(input),
        [CHANNELS.lectures.editImportedTime]: (
          input: Parameters<CoreProcess['editImportedTime']>[0],
        ) => appCore.editImportedTime(input),
        [CHANNELS.lectures.reschedule]: (
          input: Parameters<CoreProcess['reschedule']>[0],
        ) => appCore.reschedule(input),
        [CHANNELS.lectures.cancelReschedule]: (jobId: string) =>
          appCore.cancelReschedule(jobId),
        [CHANNELS.lectures.deleteLecture]: (
          jobId: string,
          occurrenceId?: string,
        ) => appCore.deleteLecture(jobId, occurrenceId),
        [CHANNELS.journal.list]: (
          filter: Parameters<CoreProcess['listJournalPage']>[0],
          cursor?: string,
        ) => appCore.listJournalPage(filter, cursor),
        [CHANNELS.journal.consumeOpenRequest]: () => {
          const pending = journalOpenPending;
          journalOpenPending = false;
          return pending;
        },
        [CHANNELS.core.getStatus]: () => appCore.getStatus(),
        [CHANNELS.core.start]: () => appCore.start(),
        [CHANNELS.core.stop]: () => appCore.stop(),
      },
    });

    mainWindow = createMainWindow({
      rendererUrl: process.env['ELECTRON_RENDERER_URL'],
      hidden: startHidden,
      isQuitting: () => quit.isQuitting(),
    });
    tray = createTray({
      tooltip: 'Online Lecture',
      onOpen: showMainWindow,
      onStop: () => appCore.stopCurrentLecture(),
      onQuit: () => {
        app.quit();
      },
    });
    tray.update(trayStateFromView(appCore.getLecturesView()));
    markReady();
  });
}

startApplicationInstance({
  app,
  platform: process.platform,
  onOpen: showMainWindow,
  startPrimary,
});

app.on('activate', () => {
  showMainWindow();
});

app.on('before-quit', (event) => {
  const decision = quit.onBeforeQuit();
  if (decision === 'prevent') {
    event.preventDefault();
    return;
  }
  if (decision === 'begin-shutdown') {
    // Give the worker a chance to leave a running lecture before the quit.
    event.preventDefault();
    void (core?.shutdown(10_000) ?? Promise.resolve())
      .catch(() => undefined)
      .finally(() => {
        quit.finishShutdown();
        app.quit();
      });
    return;
  }
  tray?.tray.destroy();
  core?.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
