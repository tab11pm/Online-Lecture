import { describe, it, expect, vi } from 'vitest';
import {
  registerIpc,
  INVOKE_CHANNELS,
  type IpcHandlerMap,
  type IpcMainLike,
} from '../../src/main/ipc.js';
import { CHANNELS } from '../../src/shared/ipc-contract.js';

type RegisteredListener = (event: unknown, ...args: unknown[]) => unknown;

function fakeIpcMain() {
  const listeners = new Map<string, RegisteredListener>();
  const registered: string[] = [];
  const ipcMain: IpcMainLike = {
    handle: (channel, listener) => {
      registered.push(channel);
      listeners.set(channel, listener);
    },
  };
  return {
    ipcMain,
    registered,
    invoke: async (channel: string, ...args: unknown[]): Promise<unknown> => {
      const listener = listeners.get(channel);
      if (!listener) {
        throw new Error(`No handler registered for '${channel}'`);
      }
      return listener({}, ...args);
    },
  };
}

function handlersWith(overrides: IpcHandlerMap = {}): IpcHandlerMap {
  const base: IpcHandlerMap = {};
  for (const channel of INVOKE_CHANNELS) {
    base[channel] = vi.fn().mockResolvedValue(undefined);
  }
  return { ...base, ...overrides };
}

describe('registerIpc', () => {
  it('exposes browser selection and installation through narrow IPC channels', async () => {
    const { ipcMain, invoke } = fakeIpcMain();
    const setBrowser = vi.fn().mockResolvedValue({ choice: 'edge' });
    const install = vi.fn().mockResolvedValue({ choice: 'chromium' });
    registerIpc({
      ipcMain,
      handlers: handlersWith({
        [CHANNELS.app.setBrowser]: setBrowser,
        [CHANNELS.app.installChromium]: install,
      }),
    });
    await expect(invoke(CHANNELS.app.setBrowser, 'edge')).resolves.toEqual({
      choice: 'edge',
    });
    await expect(invoke(CHANNELS.app.installChromium)).resolves.toEqual({
      choice: 'chromium',
    });
  });
  it('registers exactly one handler for every invoke channel', () => {
    const { ipcMain, registered } = fakeIpcMain();

    registerIpc({ ipcMain, handlers: handlersWith() });

    expect(registered).toHaveLength(INVOKE_CHANNELS.length);
    expect(new Set(registered).size).toBe(INVOKE_CHANNELS.length);
    for (const channel of INVOKE_CHANNELS) {
      expect(registered.filter((value) => value === channel)).toHaveLength(1);
    }
  });

  it('does not register channels outside the contract', () => {
    const { ipcMain, registered } = fakeIpcMain();

    registerIpc({
      ipcMain,
      handlers: { 'unknown:channel': vi.fn() },
    });

    expect(registered).not.toContain('unknown:channel');
    expect(registered).toHaveLength(0);
  });

  it('forwards invoke arguments to the matching handler and resolves its value', async () => {
    const { ipcMain, invoke } = fakeIpcMain();
    const login = vi.fn().mockResolvedValue({ ok: true });
    const handlers = handlersWith({ [CHANNELS.onboarding.login]: login });

    registerIpc({ ipcMain, handlers });

    await expect(
      invoke(CHANNELS.onboarding.login, {
        username: 'student',
        password: 'secret',
      }),
    ).resolves.toEqual({ ok: true });
    expect(login).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledWith({
      username: 'student',
      password: 'secret',
    });
  });

  it('rejects a handler error with a redacted message', async () => {
    const { ipcMain, invoke } = fakeIpcMain();
    const handlers = handlersWith({
      [CHANNELS.onboarding.checkSession]: vi
        .fn()
        .mockRejectedValue(
          new Error('cookie: session=abc https://bbb2.tusur.ru/b/abc'),
        ),
    });

    registerIpc({ ipcMain, handlers });

    await expect(invoke(CHANNELS.onboarding.checkSession)).rejects.toThrow();
    await invoke(CHANNELS.onboarding.checkSession).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain('bbb2.tusur.ru');
      expect(message).not.toContain('abc');
    });
  });

  it('rejects invocations of channels with no registered handler', async () => {
    const { ipcMain, invoke } = fakeIpcMain();

    registerIpc({ ipcMain, handlers: handlersWith() });

    await expect(invoke('app:missing')).rejects.toThrow();
  });
});
