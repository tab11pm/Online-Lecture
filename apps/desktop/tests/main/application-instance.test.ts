import { describe, expect, it, vi } from 'vitest';
import { startApplicationInstance } from '../../src/main/application-instance.js';
import { APPLICATION_ID } from '../../src/shared/application-identity.js';

type Listener = () => void;

function createApp({ lock = true }: { lock?: boolean } = {}) {
  const listeners: Listener[] = [];
  const calls: string[] = [];
  const app = {
    requestSingleInstanceLock: vi.fn(() => lock),
    quit: vi.fn(() => calls.push('quit')),
    on: vi.fn((_event: 'second-instance', listener: Listener) => {
      listeners.push(listener);
    }),
    setAppUserModelId: vi.fn((id: string) => calls.push(`appId:${id}`)),
  };
  return {
    app,
    calls,
    emitSecondInstance: () => {
      for (const listener of listeners) listener();
    },
  };
}

describe('startApplicationInstance', () => {
  it('quits without starting the primary when the lock is denied', () => {
    const { app } = createApp({ lock: false });
    const startPrimary = vi.fn();

    startApplicationInstance({
      app,
      platform: 'win32',
      onOpen: vi.fn(),
      startPrimary,
    });

    expect(app.quit).toHaveBeenCalledTimes(1);
    expect(app.setAppUserModelId).not.toHaveBeenCalled();
    expect(startPrimary).not.toHaveBeenCalled();
  });

  it('sets the Windows app id before starting the primary', () => {
    const { app, calls } = createApp();
    let startCalls = 0;
    app.setAppUserModelId.mockImplementation((id: string) => {
      calls.push(`appId:${id}`);
    });

    startApplicationInstance({
      app,
      platform: 'win32',
      onOpen: vi.fn(),
      startPrimary: () => {
        startCalls += 1;
        expect(calls).toEqual([`appId:${APPLICATION_ID}`]);
      },
    });

    expect(startCalls).toBe(1);
  });

  it('does not set the Windows app id on other platforms', () => {
    const { app } = createApp();

    startApplicationInstance({
      app,
      platform: 'linux',
      onOpen: vi.fn(),
      startPrimary: vi.fn(),
    });

    expect(app.setAppUserModelId).not.toHaveBeenCalled();
  });

  it('defers early second launches and opens once after ready', () => {
    const { app, emitSecondInstance } = createApp();
    const onOpen = vi.fn();
    let markReady: (() => void) | undefined;

    startApplicationInstance({
      app,
      platform: 'win32',
      onOpen,
      startPrimary: (mark) => {
        markReady = mark;
      },
    });

    emitSecondInstance();
    emitSecondInstance();
    expect(onOpen).not.toHaveBeenCalled();

    markReady?.();
    expect(onOpen).toHaveBeenCalledTimes(1);

    markReady?.();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('opens the existing window for launches after ready', () => {
    const { app, emitSecondInstance } = createApp();
    const onOpen = vi.fn();

    startApplicationInstance({
      app,
      platform: 'win32',
      onOpen,
      startPrimary: (markReady) => markReady(),
    });

    emitSecondInstance();
    emitSecondInstance();

    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});
