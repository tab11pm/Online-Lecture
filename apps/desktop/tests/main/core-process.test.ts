import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  CoreProcess,
  LECTURE_MUTATION_TIMEOUT_MS,
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

function createProcess({
  autoReady = true,
  fork,
  runtimeMode,
}: {
  autoReady?: boolean;
  fork?: (entryPath: string, args: string[]) => CoreChild;
  runtimeMode?: 'development' | 'packaged';
} = {}) {
  const fake = createFakeChild();
  const onChanged = vi.fn();
  const onStatusChanged = vi.fn();
  const onNotification = vi.fn();
  const onLecturesChanged = vi.fn();
  const onJournalEvent = vi.fn();
  const core = new CoreProcess(
    {
      entryPath: '/entry.js',
      userDataDir: '/data',
      initialShowLectureWindow: true,
      ...(runtimeMode ? { runtimeMode } : {}),
      fork: fork ?? (() => fake.child),
    },
    {
      onChanged,
      onStatusChanged,
      onNotification,
      onLecturesChanged,
      onJournalEvent,
    },
  );
  if (autoReady) {
    core.start();
    fake.emitMessage({ type: 'host.ready' });
  }
  return {
    core,
    onChanged,
    onStatusChanged,
    onNotification,
    onLecturesChanged,
    onJournalEvent,
    ...fake,
  };
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
  it('rejects a pending journal page when the worker exits', async () => {
    const { core, emitExit, posted } = createProcess();
    const pending = core.listJournalPage('errors');
    expect(posted).toContainEqual(
      expect.objectContaining({ type: 'journal.list', filter: 'errors' }),
    );

    emitExit(1);

    await expect(pending).rejects.toThrow(
      'Процесс ядра неожиданно завершился.',
    );
  });

  it('forwards only a typed new journal event', () => {
    const { emitMessage, onJournalEvent } = createProcess();
    emitMessage({
      type: 'journal.event',
      event: { id: 1, code: 'login_succeeded', title: 'Приложение' },
    });
    expect(onJournalEvent).toHaveBeenCalledWith({
      id: 1,
      code: 'login_succeeded',
      title: 'Приложение',
    });
  });
  it('sends the initial browser choice before a queued session check', () => {
    const fake = createFakeChild();
    const core = new CoreProcess(
      {
        entryPath: '/entry.js',
        userDataDir: '/data',
        initialBrowserChoice: 'chromium',
        initialShowLectureWindow: true,
        fork: () => fake.child,
      },
      {
        onChanged: vi.fn(),
        onStatusChanged: vi.fn(),
        onNotification: vi.fn(),
        onLecturesChanged: vi.fn(),
      },
    );
    core.start();
    void core.checkSession();
    fake.emitMessage({ type: 'host.ready' });
    expect(fake.posted.slice(1, 3)).toEqual([
      { type: 'browser.setChoice', choice: 'chromium' },
      { type: 'onboarding.checkSession' },
    ]);
    fake.emitMessage({
      type: 'onboarding.stateResult',
      state: { phase: 'credentials' },
    });
  });

  it('sends a changed browser choice to a running worker', () => {
    const { core, posted } = createProcess();
    core.setBrowserChoice('chromium');
    expect(posted).toContainEqual({
      type: 'browser.setChoice',
      choice: 'chromium',
    });
  });
  it('runs a session check after an outstanding state read completes', async () => {
    const { core, emitMessage, posted } = createProcess();

    const stateRead = core.getState();
    const sessionCheck = core.checkSession();

    const onboardingCommands = () =>
      posted
        .map((command) => command.type)
        .filter((type) => type.startsWith('onboarding.'));
    expect(onboardingCommands()).toEqual(['onboarding.getState']);

    emitMessage({
      type: 'onboarding.stateResult',
      state: { phase: 'welcome' },
    });
    await expect(stateRead).resolves.toEqual({ phase: 'welcome' });

    expect(onboardingCommands()).toEqual([
      'onboarding.getState',
      'onboarding.checkSession',
    ]);

    emitMessage({
      type: 'onboarding.stateResult',
      state: { phase: 'credentials' },
    });
    await expect(sessionCheck).resolves.toEqual({ phase: 'credentials' });
  });

  it('starts a new state request immediately after a deferred check completes', async () => {
    const { core, emitMessage, posted } = createProcess();

    const stateRead = core.getState();
    const sessionCheck = core.checkSession();
    emitMessage({
      type: 'onboarding.stateResult',
      state: { phase: 'welcome' },
    });
    await expect(stateRead).resolves.toEqual({ phase: 'welcome' });
    expect(
      posted.filter((command) => command.type === 'onboarding.checkSession'),
    ).toHaveLength(1);

    emitMessage({
      type: 'onboarding.stateResult',
      state: { phase: 'credentials' },
    });
    await expect(sessionCheck).resolves.toEqual({ phase: 'credentials' });

    const nextStateRead = core.getState();
    expect(
      posted.filter((command) => command.type === 'onboarding.getState'),
    ).toHaveLength(2);
    emitMessage({
      type: 'onboarding.stateResult',
      state: { phase: 'welcome' },
    });
    await expect(nextStateRead).resolves.toEqual({ phase: 'welcome' });
  });

  it('queues and coalesces state reads requested during a session check', async () => {
    const { core, emitMessage, posted } = createProcess();

    const sessionCheck = core.checkSession();
    const firstRead = core.getState();
    const secondRead = core.getState();

    const onboardingCommands = () =>
      posted
        .map((command) => command.type)
        .filter((type) => type.startsWith('onboarding.'));
    expect(onboardingCommands()).toEqual(['onboarding.checkSession']);

    emitMessage({
      type: 'onboarding.stateResult',
      state: { phase: 'session_ready' },
    });
    await expect(sessionCheck).resolves.toEqual({ phase: 'session_ready' });
    expect(onboardingCommands()).toEqual([
      'onboarding.checkSession',
      'onboarding.getState',
    ]);

    emitMessage({
      type: 'onboarding.stateResult',
      state: { phase: 'welcome' },
    });
    await expect(firstRead).resolves.toEqual({ phase: 'welcome' });
    await expect(secondRead).resolves.toEqual({ phase: 'welcome' });
  });

  it.each(['getState', 'checkSession'] as const)(
    'does not settle %s from onboarding.changed pushes',
    async (method) => {
      const { core, emitMessage, onChanged } = createProcess();
      const pending = core[method]();
      let settled = false;
      void pending.then(() => {
        settled = true;
      });

      emitMessage({
        type: 'onboarding.changed',
        state: { phase: 'credentials' },
      });
      emitMessage({
        type: 'onboarding.changed',
        state: { phase: 'credentials' },
      });
      await Promise.resolve();

      expect(settled).toBe(false);
      expect(core.getLastState()).toEqual({ phase: 'credentials' });
      expect(onChanged).toHaveBeenCalledTimes(2);

      emitMessage({
        type: 'onboarding.stateResult',
        state: { phase: 'session_ready' },
      });
      await expect(pending).resolves.toEqual({ phase: 'session_ready' });
      expect(core.getLastState()).toEqual({ phase: 'session_ready' });
    },
  );

  it('waits for stateResult before dispatching and resolving a queued state read', async () => {
    const { core, emitMessage, posted } = createProcess();
    const sessionCheck = core.checkSession();
    const stateRead = core.getState();
    let stateReadSettled = false;
    void stateRead.then(() => {
      stateReadSettled = true;
    });

    emitMessage({
      type: 'onboarding.changed',
      state: { phase: 'session_ready' },
    });
    await Promise.resolve();
    expect(
      posted.filter((command) => command.type === 'onboarding.getState'),
    ).toHaveLength(0);
    expect(stateReadSettled).toBe(false);

    emitMessage({
      type: 'onboarding.stateResult',
      state: { phase: 'session_ready' },
    });
    await expect(sessionCheck).resolves.toEqual({ phase: 'session_ready' });
    expect(
      posted.filter((command) => command.type === 'onboarding.getState'),
    ).toHaveLength(1);

    emitMessage({
      type: 'onboarding.changed',
      state: { phase: 'credentials' },
    });
    emitMessage({
      type: 'onboarding.changed',
      state: { phase: 'credentials' },
    });
    await Promise.resolve();
    expect(stateReadSettled).toBe(false);

    emitMessage({
      type: 'onboarding.stateResult',
      state: { phase: 'welcome' },
    });
    await expect(stateRead).resolves.toEqual({ phase: 'welcome' });
  });

  it('coalesces duplicate concurrent state reads', async () => {
    const { core, emitMessage, posted } = createProcess();

    const first = core.getState();
    const second = core.getState();

    expect(
      posted.filter((command) => command.type === 'onboarding.getState'),
    ).toHaveLength(1);

    emitMessage({
      type: 'onboarding.stateResult',
      state: { phase: 'welcome' },
    });
    await expect(first).resolves.toEqual({ phase: 'welcome' });
    await expect(second).resolves.toEqual({ phase: 'welcome' });
  });

  it('coalesces a second concurrent state request into the first', async () => {
    const { core, emitMessage, posted } = createProcess();

    const first = core.checkSession();
    const second = core.checkSession();

    expect(
      posted.filter((command) => command.type === 'onboarding.checkSession'),
    ).toHaveLength(1);

    emitMessage({
      type: 'onboarding.stateResult',
      state: { phase: 'session_ready' },
    });
    await expect(first).resolves.toEqual({ phase: 'session_ready' });
    await expect(second).resolves.toEqual({ phase: 'session_ready' });
  });

  it('rejects a queued session check when the process stops during a state read', async () => {
    const { core, posted } = createProcess();

    const stateRead = core.getState();
    const sessionCheck = core.checkSession();
    core.stop();

    await expect(stateRead).rejects.toThrow('Процесс ядра остановлен.');
    await expect(sessionCheck).rejects.toThrow('Процесс ядра остановлен.');
    expect(
      posted.filter((command) => command.type === 'onboarding.checkSession'),
    ).toHaveLength(0);
  });

  it('rejects a queued state read when host.error arrives during a session check', async () => {
    const { core, emitMessage, posted } = createProcess();
    const sessionCheck = core.checkSession();
    const stateRead = core.getState();
    const sessionCheckResult = sessionCheck.catch((error: unknown) => error);
    const stateReadResult = stateRead.catch((error: unknown) => error);

    emitMessage({ type: 'host.error', message: 'check failed' });

    await expect(sessionCheckResult).resolves.toMatchObject({
      message: 'check failed',
    });
    await expect(stateReadResult).resolves.toMatchObject({
      message: 'check failed',
    });
    expect(
      posted.filter((command) => command.type === 'onboarding.getState'),
    ).toHaveLength(0);
  });

  it('rejects a queued session check when the preceding state read times out', async () => {
    vi.useFakeTimers();
    const { core, posted } = createProcess();

    const stateRead = core.getState();
    const sessionCheck = core.checkSession();
    const stateReadOutcome = stateRead.catch((error: unknown) =>
      errorMessage(error),
    );
    const sessionCheckOutcome = sessionCheck.catch((error: unknown) =>
      errorMessage(error),
    );
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);

    expect(await stateReadOutcome).toContain('Истекло время');
    expect(await sessionCheckOutcome).toContain('Истекло время');
    expect(
      posted.filter((command) => command.type === 'onboarding.checkSession'),
    ).toHaveLength(0);
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
      type: 'onboarding.stateResult',
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
      type: 'onboarding.stateResult',
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
    emitMessage({
      type: 'onboarding.changed',
      state: { phase: 'welcome' },
    });
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
      type: 'onboarding.stateResult',
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

describe('CoreProcess lectures', () => {
  it('times out a mutation and ignores a late reply', async () => {
    vi.useFakeTimers();
    try {
      const { core, posted, emitMessage } = createProcess();
      const pending = core.deleteLecture('manual:1');
      const command = posted.at(-1)!;
      if (!('requestId' in command)) throw new Error('No request ID');
      const result = expect(pending).rejects.toThrow('Истекло время');
      await vi.advanceTimersByTimeAsync(LECTURE_MUTATION_TIMEOUT_MS);
      await result;
      emitMessage({
        type: 'lectures.commandResult',
        requestId: command.requestId,
        ok: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves a schedule command once and rejects a redacted worker error', async () => {
    const { core, posted, emitMessage } = createProcess();
    const pending = core.resolveManualTarget('Алгебра');
    const command = posted.at(-1)!;
    expect(command).toMatchObject({
      type: 'lectures.resolveManualTarget',
      query: 'Алгебра',
    });
    if (!('requestId' in command)) throw new Error('No request ID');
    emitMessage({
      type: 'lectures.commandResult',
      requestId: command.requestId,
      ok: true,
      value: { status: 'not_found' },
    });
    await expect(pending).resolves.toEqual({ status: 'not_found' });
    const second = core.deleteLecture('manual:1');
    const next = posted.at(-1)!;
    if (!('requestId' in next)) throw new Error('No request ID');
    emitMessage({
      type: 'lectures.commandResult',
      requestId: next.requestId,
      ok: false,
      message: 'bad https://sdo.tusur.ru/x?token=secret',
    });
    await expect(second).rejects.toThrow('[REDACTED_URL]');
  });

  it('rejects all outstanding lecture requests when the worker exits', async () => {
    const { core, emitExit } = createProcess();
    const a = core.resolveManualTarget('Алгебра');
    const b = core.deleteLecture('manual:1');
    emitExit(1);
    await expect(a).rejects.toThrow('завершился');
    await expect(b).rejects.toThrow('завершился');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const view = { agenda: [], import: { status: 'idle' as const } };

  it('caches the latest lectures view', () => {
    const { core, onLecturesChanged, emitMessage } = createProcess();
    expect(core.getLecturesView()).toEqual(view);
    const next = {
      ...view,
      import: { status: 'running' as const, stage: 'group' as const },
    };
    emitMessage({ type: 'lectures.changed', view: next });
    expect(core.getLecturesView()).toEqual(next);
    expect(onLecturesChanged).toHaveBeenCalledWith(next);
  });

  it('resets and broadcasts the empty view when the worker exits', () => {
    const { core, onLecturesChanged, emitMessage, emitExit } = createProcess();
    emitMessage({
      type: 'lectures.changed',
      view: {
        ...view,
        import: { status: 'running' as const, stage: 'group' as const },
      },
    });
    onLecturesChanged.mockClear();
    emitExit(1);
    expect(core.getLecturesView()).toEqual(view);
    expect(onLecturesChanged).toHaveBeenCalledWith(view);
  });

  it('sends the initial show-window setting before queued commands flush', () => {
    const fake = createFakeChild();
    const core = new CoreProcess(
      {
        entryPath: '/entry.js',
        userDataDir: '/data',
        initialShowLectureWindow: false,
        fork: () => fake.child,
      },
      {
        onChanged: vi.fn(),
        onStatusChanged: vi.fn(),
        onNotification: vi.fn(),
        onLecturesChanged: vi.fn(),
      },
    );
    core.start();
    core.importLectures();
    fake.emitMessage({ type: 'host.ready' });
    expect(fake.posted.slice(0, 2)).toEqual([
      { type: 'lectures.setShowWindow', show: false },
      { type: 'lectures.import' },
    ]);
  });

  it('forwards lecture commands', () => {
    const { core, posted } = createProcess();
    core.importLectures();
    core.stopCurrentLecture();
    core.setLectureSkipped('j', 'o', true);
    core.setShowLectureWindow(false);
    core.systemResumed();
    expect(posted.slice(1)).toEqual([
      { type: 'lectures.import' },
      { type: 'lectures.stopCurrent' },
      {
        type: 'lectures.setSkipped',
        jobId: 'j',
        occurrenceId: 'o',
        skipped: true,
      },
      { type: 'lectures.setShowWindow', show: false },
      { type: 'system.resumed' },
    ]);
  });

  it('shutdown waits for shutdownComplete', async () => {
    const { core, posted, emitMessage } = createProcess();
    let done = false;
    const pending = core.shutdown(10_000).then(() => {
      done = true;
    });
    expect(posted).toContainEqual({ type: 'app.shutdown' });
    await Promise.resolve();
    expect(done).toBe(false);
    emitMessage({ type: 'host.shutdownComplete' });
    await pending;
    expect(core.getStatus()).toBe('stopped');
  });

  it('shutdown gives up after the timeout', async () => {
    vi.useFakeTimers();
    const { core } = createProcess();
    const pending = core.shutdown(10_000);
    await vi.advanceTimersByTimeAsync(10_000);
    await pending;
    expect(core.getStatus()).toBe('stopped');
  });

  it('shutdown without a running worker resolves immediately', async () => {
    const fake = createFakeChild();
    const core = new CoreProcess(
      {
        entryPath: '/entry.js',
        userDataDir: '/data',
        initialShowLectureWindow: true,
        fork: () => fake.child,
      },
      {
        onChanged: vi.fn(),
        onStatusChanged: vi.fn(),
        onNotification: vi.fn(),
        onLecturesChanged: vi.fn(),
      },
    );
    await core.shutdown(10_000);
    expect(core.getStatus()).toBe('stopped');
  });
});

describe('worker startup arguments', () => {
  it('passes development mode by default', () => {
    const fork = vi.fn(() => createFakeChild().child);

    const core = new CoreProcess(
      {
        entryPath: '/entry.js',
        userDataDir: '/data',
        initialShowLectureWindow: true,
        fork,
      },
      {
        onChanged: vi.fn(),
        onStatusChanged: vi.fn(),
        onNotification: vi.fn(),
        onLecturesChanged: vi.fn(),
      },
    );
    core.start();

    expect(fork).toHaveBeenCalledWith('/entry.js', [
      '/data',
      '0',
      '',
      'development',
    ]);
  });

  it('passes packaged mode and preserves an empty external channel', () => {
    const fork = vi.fn(() => createFakeChild().child);

    const core = new CoreProcess(
      {
        entryPath: '/entry.js',
        userDataDir: '/data',
        initialShowLectureWindow: true,
        externalChannel: '',
        runtimeMode: 'packaged',
        fork,
      },
      {
        onChanged: vi.fn(),
        onStatusChanged: vi.fn(),
        onNotification: vi.fn(),
        onLecturesChanged: vi.fn(),
      },
    );
    core.start();

    expect(fork).toHaveBeenCalledWith('/entry.js', [
      '/data',
      '1',
      '',
      'packaged',
    ]);
  });
});
