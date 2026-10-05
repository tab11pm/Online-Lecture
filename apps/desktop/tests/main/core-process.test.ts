import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  CoreProcess,
  REQUEST_TIMEOUT_MS,
  type CoreChild,
} from '../../src/main/core-process.js';
import type { HostEvent, MainCommand } from '../../src/shared/host-protocol.js';

type Listener = (...args: unknown[]) => void;

function createFakeChild() {
  const posted: MainCommand[] = [];
  const messageListeners: Listener[] = [];
  const exitListeners: Listener[] = [];
  const child: CoreChild = {
    on(event, listener) {
      if (event === 'message') {
        messageListeners.push(listener);
      } else if (event === 'exit') {
        exitListeners.push(listener);
      }
      return child;
    },
    postMessage(message) {
      posted.push(message as MainCommand);
    },
    kill: () => true,
  };
  return {
    child,
    posted,
    emitMessage: (event: HostEvent): void => {
      for (const listener of messageListeners) {
        listener(event);
      }
    },
    emitExit: (code = 0): void => {
      for (const listener of exitListeners) {
        listener(code);
      }
    },
  };
}

function createProcess({ autoReady = true } = {}) {
  const fake = createFakeChild();
  const onChanged = vi.fn();
  const onStatusChanged = vi.fn();
  const onNotification = vi.fn();
  const core = new CoreProcess(
    {
      entryPath: '/entry.js',
      userDataDir: '/data',
      fork: () => fake.child,
    },
    { onChanged, onStatusChanged, onNotification },
  );
  if (autoReady) {
    core.start();
    fake.emitMessage({ type: 'host.ready' });
  }
  return { core, onChanged, onStatusChanged, onNotification, ...fake };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function settleWithin<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T | 'timeout'> {
  return Promise.race([
    promise,
    new Promise<'timeout'>((resolve) => {
      setTimeout(() => resolve('timeout'), ms);
    }),
  ]);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('CoreProcess request bridge', () => {
  it('coalesces a second concurrent state request into the first', async () => {
    const { core, emitMessage, posted } = createProcess();

    const first = core.checkSession();
    const second = core.checkSession();

    expect(
      posted.filter((command) => command.type === 'onboarding.checkSession'),
    ).toHaveLength(1);

    emitMessage({
      type: 'onboarding.changed',
      state: { phase: 'session_ready' },
    });
    await expect(first).resolves.toEqual({ phase: 'session_ready' });
    await expect(second).resolves.toEqual({ phase: 'session_ready' });
  });

  it('clears the pending slot on timeout so a later request is accepted', async () => {
    vi.useFakeTimers();
    const { core, emitMessage, posted } = createProcess();

    const first = core.checkSession();
    const firstOutcome = first.then(
      () => 'resolved',
      (error: unknown) => errorMessage(error),
    );
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect(await firstOutcome).toContain('Истекло время');

    const second = core.checkSession();
    expect(
      posted.filter((command) => command.type === 'onboarding.checkSession'),
    ).toHaveLength(2);

    emitMessage({
      type: 'onboarding.changed',
      state: { phase: 'credentials' },
    });
    await expect(settleWithin(second, 50)).resolves.toEqual({
      phase: 'credentials',
    });
  });

  it('does not let a late event re-resolve a settled request', async () => {
    const { core, emitMessage } = createProcess();

    const pending = core.getState();
    emitMessage({
      type: 'onboarding.changed',
      state: { phase: 'session_ready' },
    });
    await expect(pending).resolves.toEqual({ phase: 'session_ready' });

    expect(() =>
      emitMessage({
        type: 'onboarding.changed',
        state: { phase: 'credentials' },
      }),
    ).not.toThrow();
    expect(core.getLastState()).toEqual({ phase: 'credentials' });
  });

  it('keeps changed push events flowing with no request outstanding', () => {
    const { core, emitMessage, onChanged } = createProcess();

    core.start();
    emitMessage({ type: 'onboarding.changed', state: { phase: 'welcome' } });
    emitMessage({
      type: 'onboarding.changed',
      state: { phase: 'credentials' },
    });

    expect(onChanged).toHaveBeenCalledTimes(2);
    expect(core.getLastState()).toEqual({ phase: 'credentials' });
  });

  it('coalesces a second concurrent login request into the first', async () => {
    const { core, emitMessage, posted } = createProcess();

    const first = core.login({ username: 'student', password: 'secret' });
    const second = core.login({ username: 'student', password: 'secret' });

    expect(
      posted.filter((command) => command.type === 'onboarding.login'),
    ).toHaveLength(1);

    emitMessage({ type: 'onboarding.loginResult', outcome: { ok: true } });
    await expect(first).resolves.toEqual({ ok: true });
    await expect(second).resolves.toEqual({ ok: true });
  });

  it('rejects the outstanding request and notifies on host.error', async () => {
    const { core, emitMessage, onNotification } = createProcess();

    const pending = core.getState();
    emitMessage({ type: 'host.error', message: 'boom' });

    await expect(pending).rejects.toThrow('boom');
    expect(onNotification).toHaveBeenCalledWith({
      level: 'error',
      message: 'boom',
    });
  });

  it('rejects the outstanding request when the worker exits', async () => {
    const { core, emitExit, onStatusChanged } = createProcess();

    const pending = core.getState();
    emitExit(1);

    await expect(pending).rejects.toThrow('завершился');
    expect(core.getStatus()).toBe('error');
    expect(onStatusChanged).toHaveBeenCalledWith('error');
  });

  it('queues commands until host.ready and only then becomes running', async () => {
    const { core, emitMessage, posted, onStatusChanged } = createProcess({
      autoReady: false,
    });

    const pending = core.checkSession();
    expect(core.getStatus()).toBe('starting');
    expect(posted).toHaveLength(0);
    expect(onStatusChanged).not.toHaveBeenCalledWith('running');

    emitMessage({ type: 'host.ready' });

    expect(core.getStatus()).toBe('running');
    expect(onStatusChanged).toHaveBeenCalledWith('running');
    expect(
      posted.filter((command) => command.type === 'onboarding.checkSession'),
    ).toHaveLength(1);

    emitMessage({
      type: 'onboarding.changed',
      state: { phase: 'session_ready' },
    });
    await expect(pending).resolves.toEqual({ phase: 'session_ready' });
  });

  it('exempts manual SSO from the RPC timeout', async () => {
    vi.useFakeTimers();
    const { core, emitMessage } = createProcess();

    const pending = core.openManualSso();
    let settled = false;
    void pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS * 2);
    expect(settled).toBe(false);

    emitMessage({ type: 'onboarding.loginResult', outcome: { ok: true } });
    await expect(pending).resolves.toEqual({ ok: true });
  });
});
