import { describe, it, expect, vi } from 'vitest';
import { SdoMcpUnavailableError } from '@core/core/mcp-errors.js';
import { CoreHost, type HostTransport } from '../../src/worker/core-host.js';
import type { CoreLog } from '../../src/worker/core-log.js';
import { OnboardingMachine } from '../../src/worker/onboarding-machine.js';
import type { HostEvent, MainCommand } from '../../src/shared/host-protocol.js';
import type { AppPaths } from '../../src/shared/paths.js';
import type { LoginOutcome } from '../../src/shared/onboarding.js';
import type { SessionProvider } from '../../src/worker/session-provider.js';
import type {
  LectureControl,
  LectureHostEvents,
} from '../../src/worker/core-host.js';
import type { LecturesView } from '../../src/shared/lectures.js';

function fakeTransport() {
  const posted: HostEvent[] = [];
  let handler: ((command: MainCommand) => void) | undefined;
  const transport: HostTransport = {
    post: (event) => posted.push(event),
    onMessage: (h) => {
      handler = h;
    },
  };
  return {
    transport,
    posted,
    send: (command: MainCommand) => handler?.(command),
  };
}

const paths: AppPaths = {
  root: '/d',
  database: '/d/db',
  authState: '/d/auth.json',
  credentials: '/d/c.enc',
  settings: '/d/s.json',
  logs: '/d/logs',
};

function machine(
  overrides: Partial<ConstructorParameters<typeof OnboardingMachine>[0]> = {},
) {
  return new OnboardingMachine({
    login: vi.fn().mockResolvedValue({ ok: true }),
    openManualSso: vi.fn().mockResolvedValue({ ok: true }),
    checkSession: vi.fn().mockResolvedValue(true),
    ...overrides,
  });
}

// The real OnboardingMachine now degrades a failed session check to the
// credentials phase (covered by its own tests), so CoreHost's error path is
// exercised with a minimal machine whose command rejects.
function throwingMachine(error: Error): OnboardingMachine {
  return {
    onChange: () => () => undefined,
    start: () => ({ phase: 'welcome' }),
    getState: () => ({ phase: 'welcome' }),
    submitCredentials: vi.fn().mockResolvedValue({ phase: 'welcome' }),
    openManualSso: vi.fn().mockResolvedValue({ phase: 'welcome' }),
    checkSession: vi.fn().mockRejectedValue(error),
  } as unknown as OnboardingMachine;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const lecturesView: LecturesView = {
  agenda: [],
  import: { status: 'idle' },
};

function fakeLectures() {
  let events: LectureHostEvents | undefined;
  const control = {
    open: vi.fn(async () => undefined),
    activate: vi.fn(),
    deactivate: vi.fn(),
    getView: vi.fn(() => lecturesView),
    importNow: vi.fn(async () => undefined),
    stopCurrent: vi.fn(async () => undefined),
    setSkipped: vi.fn(async () => undefined),
    setBrowser: vi.fn(),
    resumed: vi.fn(),
    shutdown: vi.fn(async () => undefined),
  } satisfies LectureControl;
  return {
    control,
    events: () => events!,
    factory: (hostEvents: LectureHostEvents): LectureControl => {
      events = hostEvents;
      return control;
    },
  };
}

describe('CoreHost', () => {
  it('applies browser changes to future provider operations', () => {
    const { transport, send } = fakeTransport();
    const provider = {
      loginWithCredentials: vi.fn(),
      openManualLogin: vi.fn(),
      checkSession: vi.fn().mockResolvedValue(false),
      setBrowserChoice: vi.fn(),
    };
    new CoreHost(transport, { paths, provider }).start();
    send({ type: 'browser.setChoice', choice: 'chromium' });
    expect(provider.setBrowserChoice).toHaveBeenCalledWith('chromium');
  });
  it('posts the initial onboarding state when started', () => {
    const { transport, posted } = fakeTransport();
    new CoreHost(transport, { paths, machine: machine() }).start();

    expect(posted).toContainEqual({
      type: 'onboarding.changed',
      state: { phase: 'welcome' },
    });
  });

  it('posts the current state for onboarding.getState', () => {
    const { transport, posted, send } = fakeTransport();
    const host = new CoreHost(transport, { paths, machine: machine() });
    host.start();
    posted.length = 0;

    send({ type: 'onboarding.getState' });

    expect(posted).toContainEqual({
      type: 'onboarding.changed',
      state: { phase: 'welcome' },
    });
  });

  it('drives the machine and posts a login result on onboarding.login', async () => {
    const login = vi
      .fn()
      .mockResolvedValue({ ok: true } satisfies LoginOutcome);
    const { transport, posted, send } = fakeTransport();
    const host = new CoreHost(transport, {
      paths,
      machine: machine({ login }),
    });
    host.start();

    send({
      type: 'onboarding.login',
      input: { username: 'student', password: 'secret' },
    });
    await flush();

    expect(login).toHaveBeenCalledWith({
      username: 'student',
      password: 'secret',
    });
    expect(posted).toContainEqual({
      type: 'onboarding.changed',
      state: { phase: 'session_ready' },
    });
    expect(posted).toContainEqual({
      type: 'onboarding.loginResult',
      outcome: { ok: true },
    });
  });

  it('ignores unknown commands without throwing', () => {
    const { transport, posted, send } = fakeTransport();
    const host = new CoreHost(transport, { paths, machine: machine() });
    host.start();

    expect(() =>
      send({ type: 'onboarding.nonsense' } as unknown as MainCommand),
    ).not.toThrow();
    expect(posted).not.toContainEqual(
      expect.objectContaining({ type: 'host.error' }),
    );
  });

  it('adapts an injected provider and forwards the auth state path', async () => {
    const provider: SessionProvider = {
      loginWithCredentials: vi.fn().mockResolvedValue({ ok: true }),
      openManualLogin: vi.fn().mockResolvedValue({ ok: true }),
      checkSession: vi.fn().mockResolvedValue(true),
    };
    const { transport, posted, send } = fakeTransport();
    const host = new CoreHost(transport, { paths, provider });
    host.start();

    send({
      type: 'onboarding.login',
      input: { username: 'student', password: 'secret' },
    });
    await flush();

    expect(provider.loginWithCredentials).toHaveBeenCalledWith({
      username: 'student',
      password: 'secret',
      authStatePath: paths.authState,
    });
    expect(posted).toContainEqual({
      type: 'onboarding.loginResult',
      outcome: { ok: true },
    });
  });

  it('redacts a bare host without a scheme in host.error', async () => {
    const { transport, posted, send } = fakeTransport();
    const host = new CoreHost(transport, {
      paths,
      machine: throwingMachine(new Error('failed at bbb2.tusur.ru/b/abc')),
    });
    host.start();

    send({ type: 'onboarding.checkSession' });
    await flush();

    const error = posted.find(
      (event): event is Extract<HostEvent, { type: 'host.error' }> =>
        event.type === 'host.error',
    );
    expect(error?.message).not.toContain('bbb2.tusur.ru');
    expect(error?.message).not.toContain('abc');
  });

  it('posts a redacted host.error when a command fails', async () => {
    const { transport, posted, send } = fakeTransport();
    const host = new CoreHost(transport, {
      paths,
      machine: throwingMachine(
        new Error('cookie: session=abc https://tusur.ru/?token=xyz'),
      ),
    });
    host.start();

    send({ type: 'onboarding.checkSession' });
    await flush();

    const error = posted.find(
      (event): event is Extract<HostEvent, { type: 'host.error' }> =>
        event.type === 'host.error',
    );
    expect(error).toBeDefined();
    expect(error?.message).not.toContain('tusur.ru');
    expect(error?.message).not.toContain('abc');
    expect(error?.message).not.toContain('xyz');
  });

  it('logs SDO MCP unavailability with reason and source', async () => {
    const provider: SessionProvider = {
      loginWithCredentials: vi.fn().mockResolvedValue({ ok: true }),
      openManualLogin: vi.fn().mockResolvedValue({ ok: true }),
      checkSession: vi
        .fn()
        .mockRejectedValue(
          new SdoMcpUnavailableError('exited', 'bundled', 'exit code 1'),
        ),
    };
    const log: CoreLog = {
      path: '/d/logs/core.log',
      info: vi.fn(),
      error: vi.fn(),
    };
    const { transport, posted, send } = fakeTransport();
    const host = new CoreHost(transport, { paths, provider, log });
    host.start();

    send({ type: 'onboarding.checkSession' });
    await flush();

    const logged = vi.mocked(log.error).mock.calls.map(([line]) => line);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('exited');
    expect(logged[0]).toContain('bundled');
    expect(logged[0]).toContain('exit code 1');
    expect(posted).toContainEqual({
      type: 'onboarding.changed',
      state: {
        phase: 'failed',
        message:
          'Компонент входа SDO MCP не запустился. Подробности в журнале: /d/logs/core.log.',
      },
    });
  });

  it('activates lectures after a successful login', async () => {
    const lectures = fakeLectures();
    const { transport, send } = fakeTransport();
    new CoreHost(transport, {
      paths,
      machine: machine({ checkSession: vi.fn().mockResolvedValue(false) }),
      lectures: lectures.factory,
    }).start();
    await flush();
    expect(lectures.control.open).toHaveBeenCalledTimes(1);
    expect(lectures.control.activate).not.toHaveBeenCalled();

    send({
      type: 'onboarding.login',
      input: { username: 'student', password: 'secret' },
    });
    await flush();
    expect(lectures.control.activate).toHaveBeenCalledWith('login');

    send({ type: 'onboarding.checkSession' });
    await flush();
    expect(lectures.control.deactivate).toHaveBeenCalledTimes(1);
  });

  it('activates lectures on startup when the stored session is valid', async () => {
    const lectures = fakeLectures();
    const { transport, send } = fakeTransport();
    new CoreHost(transport, {
      paths,
      machine: machine(),
      lectures: lectures.factory,
    }).start();
    send({ type: 'onboarding.checkSession' });
    await flush();
    expect(lectures.control.activate).toHaveBeenCalledWith('startup');
  });

  it.each([
    [
      'Lecture database is not open',
      'База лекций недоступна. Перезапустите приложение.',
    ],
    ['Lecture not found', 'Пара не найдена. Обновите расписание.'],
    ['Occurrence not found', 'Пара не найдена. Обновите расписание.'],
  ])('translates the worker error "%s" into Russian', async (raw, russian) => {
    const lectures = fakeLectures();
    lectures.control.setSkipped.mockRejectedValueOnce(new Error(raw));
    const { transport, posted, send } = fakeTransport();
    new CoreHost(transport, {
      paths,
      machine: machine(),
      lectures: lectures.factory,
    }).start();
    await flush();

    send({
      type: 'lectures.setSkipped',
      jobId: 'tt:1',
      occurrenceId: 'tt:1:x',
      skipped: true,
    });
    await flush();

    expect(posted).toContainEqual({ type: 'host.error', message: russian });
  });

  it('forwards lecture commands', async () => {
    const lectures = fakeLectures();
    const { transport, posted, send } = fakeTransport();
    new CoreHost(transport, {
      paths,
      machine: machine(),
      lectures: lectures.factory,
    }).start();
    await flush();

    send({ type: 'lectures.getView' });
    send({ type: 'lectures.import' });
    send({ type: 'lectures.stopCurrent' });
    send({
      type: 'lectures.setSkipped',
      jobId: 'tt:1',
      occurrenceId: 'tt:1:x',
      skipped: true,
    });
    send({ type: 'system.resumed' });
    send({ type: 'browser.setChoice', choice: 'edge' });
    send({ type: 'lectures.setShowWindow', show: false });
    send({ type: 'browser.setChoice', choice: 'chromium' });
    await flush();

    expect(posted).toContainEqual({
      type: 'lectures.changed',
      view: lecturesView,
    });
    expect(lectures.control.importNow).toHaveBeenCalledTimes(1);
    expect(lectures.control.stopCurrent).toHaveBeenCalledTimes(1);
    expect(lectures.control.setSkipped).toHaveBeenCalledWith(
      'tt:1',
      'tt:1:x',
      true,
    );
    expect(lectures.control.resumed).toHaveBeenCalledTimes(1);
    expect(lectures.control.setBrowser.mock.calls).toEqual([
      [{ channel: 'msedge', headless: false }],
      [{ channel: 'msedge', headless: true }],
      [{ headless: true }],
    ]);

    lectures.events().onView(lecturesView);
    expect(posted.filter((e) => e.type === 'lectures.changed')).toHaveLength(2);
  });

  it('posts a redacted host.error when a lecture command fails', async () => {
    const lectures = fakeLectures();
    lectures.control.setSkipped.mockRejectedValueOnce(
      new Error('Occurrence not found https://sdo.tusur.ru/x?id=1'),
    );
    const { transport, posted, send } = fakeTransport();
    new CoreHost(transport, {
      paths,
      machine: machine(),
      lectures: lectures.factory,
    }).start();
    send({
      type: 'lectures.setSkipped',
      jobId: 'a',
      occurrenceId: 'b',
      skipped: true,
    });
    await flush();
    const error = posted.find((event) => event.type === 'host.error');
    expect(error).toBeDefined();
    expect(JSON.stringify(error)).not.toContain('sdo.tusur.ru');
  });

  it('requires login when lectures report auth_required', async () => {
    const lectures = fakeLectures();
    const { transport, posted, send } = fakeTransport();
    new CoreHost(transport, {
      paths,
      machine: machine(),
      lectures: lectures.factory,
    }).start();
    send({ type: 'onboarding.checkSession' });
    await flush();

    lectures.events().onAuthRequired();
    await flush();

    expect(posted).toContainEqual({
      type: 'onboarding.changed',
      state: {
        phase: 'credentials',
        error: 'Сессия ТУСУР истекла. Войдите снова.',
      },
    });
    expect(lectures.control.deactivate).toHaveBeenCalledTimes(1);
  });

  it('replies shutdownComplete after shutdown', async () => {
    const lectures = fakeLectures();
    let release!: () => void;
    lectures.control.shutdown.mockImplementationOnce(
      () =>
        new Promise<undefined>(
          (resolve) => (release = () => resolve(undefined)),
        ),
    );
    const { transport, posted, send } = fakeTransport();
    new CoreHost(transport, {
      paths,
      machine: machine(),
      lectures: lectures.factory,
    }).start();
    send({ type: 'app.shutdown' });
    await flush();
    expect(lectures.control.shutdown).toHaveBeenCalledWith(10_000);
    expect(posted).not.toContainEqual({ type: 'host.shutdownComplete' });
    release();
    await flush();
    expect(posted).toContainEqual({ type: 'host.shutdownComplete' });
  });
});
