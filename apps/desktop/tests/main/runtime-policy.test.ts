import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrowserController } from '../../src/main/browser-controller.js';
import { CoreProcess, type CoreChild } from '../../src/main/core-process.js';
import {
  externalBrowserChannelForRuntime,
  initializeRuntimeEnvironment,
} from '../../src/main/runtime-policy.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'online-lecture-runtime-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  delete process.env.OL_RUNTIME_SENTINEL;
});

function policyEnv(isPackaged: boolean, overrides: NodeJS.ProcessEnv = {}) {
  return {
    isPackaged,
    appPath: join(root, 'app'),
    resourcesPath: join(root, 'resources'),
    cwd: join(root, 'cwd'),
    platform: 'win32' as const,
    ...overrides,
  };
}

function startCoreAndCaptureForkArgs(
  runtimeMode: 'development' | 'packaged',
  externalChannel?: string,
): string[] {
  let args: string[] = [];
  const child: CoreChild = {
    on: () => child,
    postMessage: () => undefined,
    kill: () => true,
  };
  const core = new CoreProcess(
    {
      entryPath: '/entry.js',
      userDataDir: '/user-data',
      initialBrowserChoice: 'chromium',
      initialShowLectureWindow: true,
      runtimeMode,
      ...(externalChannel === undefined ? {} : { externalChannel }),
      fork: (_entryPath, startupArgs) => {
        args = startupArgs;
        return child;
      },
    },
    {
      onChanged: () => undefined,
      onStatusChanged: () => undefined,
      onNotification: () => undefined,
      onLecturesChanged: () => undefined,
    },
  );

  core.start();
  return args;
}

describe('initializeRuntimeEnvironment', () => {
  it('loads .env and points at the app SQLite build in development', () => {
    writeFileSync(
      join(root, '.env'),
      'OL_RUNTIME_SENTINEL=from_file\n',
      'utf8',
    );
    const input = policyEnv(false, { cwd: root });

    const mode = initializeRuntimeEnvironment(input, process.env);

    expect(mode).toBe('development');
    expect(process.env.OL_RUNTIME_SENTINEL).toBe('from_file');
    expect(process.env.ONLINE_LECTURE_SQLITE_BINDING).toBe(
      join(input.appPath, 'native', 'better_sqlite3.node'),
    );
    delete process.env.ONLINE_LECTURE_SQLITE_BINDING;
  });

  it('honours an explicit SQLite binding only in development', () => {
    const env: NodeJS.ProcessEnv = {
      ONLINE_LECTURE_SQLITE_BINDING: '/wrong/better_sqlite3.node',
    };

    initializeRuntimeEnvironment(policyEnv(false), env);

    expect(env.ONLINE_LECTURE_SQLITE_BINDING).toBe(
      '/wrong/better_sqlite3.node',
    );
  });

  it('does not read .env in packaged mode', () => {
    writeFileSync(
      join(root, '.env'),
      'OL_RUNTIME_SENTINEL=unexpected\n',
      'utf8',
    );
    const env: NodeJS.ProcessEnv = {};

    const mode = initializeRuntimeEnvironment(
      policyEnv(true, { cwd: root }),
      env,
    );

    expect(mode).toBe('packaged');
    expect(process.env.OL_RUNTIME_SENTINEL).toBeUndefined();
  });

  it('forces the resource SQLite binding in packaged mode', () => {
    const env: NodeJS.ProcessEnv = {
      ONLINE_LECTURE_SQLITE_BINDING: '/wrong/better_sqlite3.node',
    };

    initializeRuntimeEnvironment(policyEnv(true), env);

    expect(env.ONLINE_LECTURE_SQLITE_BINDING).toBe(
      join(root, 'resources', 'native', 'better_sqlite3.node'),
    );
  });

  it('does not apply Windows browser defaults', () => {
    const env: NodeJS.ProcessEnv = {};

    initializeRuntimeEnvironment(policyEnv(true), env);

    expect('SDO_BROWSER_CHANNEL' in env).toBe(false);
  });

  it.each(['msedge', ''])(
    'ignores inherited SDO_BROWSER_CHANNEL=%j for packaged browser policy',
    async (inheritedChannel) => {
      const env: NodeJS.ProcessEnv = {
        SDO_BROWSER_CHANNEL: inheritedChannel,
      };
      const mode = initializeRuntimeEnvironment(policyEnv(true), env);
      const externalChannel = externalBrowserChannelForRuntime(mode, env);
      const settings = {
        read: async () => ({ autostart: false, browser: 'chromium' as const }),
        update: async () => ({
          autostart: false,
          browser: 'chromium' as const,
        }),
      };
      const installer = {
        getState: async () => ({ status: 'available' as const }),
        install: async () => ({ status: 'available' as const }),
      };
      const controller = new BrowserController({
        settings,
        installer,
        core: { setBrowserChoice: () => undefined },
        platform: 'win32',
        externalChannel,
      });

      expect(startCoreAndCaptureForkArgs(mode, externalChannel)).toEqual([
        '/user-data',
        '0',
        '',
        'packaged',
      ]);
      expect(await controller.getBrowser()).toEqual({
        choice: 'chromium',
        install: { status: 'available' },
      });
      await controller.assertReady();
    },
  );

  it.each(['msedge', ''])(
    'retains development SDO_BROWSER_CHANNEL=%j for the browser controller',
    async (configuredChannel) => {
      const env: NodeJS.ProcessEnv = { SDO_BROWSER_CHANNEL: configuredChannel };
      const mode = initializeRuntimeEnvironment(policyEnv(false), env);
      const externalChannel = externalBrowserChannelForRuntime(mode, env);
      const settings = {
        read: async () => ({ autostart: false, browser: 'chromium' as const }),
        update: async () => ({
          autostart: false,
          browser: 'chromium' as const,
        }),
      };
      const installer = {
        getState: async () => ({ status: 'available' as const }),
        install: async () => ({ status: 'available' as const }),
      };
      const controller = new BrowserController({
        settings,
        installer,
        core: { setBrowserChoice: () => undefined },
        platform: 'win32',
        externalChannel,
      });

      expect(await controller.getBrowser()).toEqual({
        choice: 'chromium',
        install: { status: 'available' },
        externalChannel: configuredChannel,
      });
    },
  );
});
