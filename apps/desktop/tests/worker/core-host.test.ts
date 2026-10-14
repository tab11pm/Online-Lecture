import { describe, it, expect, vi } from 'vitest';
import { SdoMcpUnavailableError } from '@core/core/mcp-errors.js';
import { CoreHost, type HostTransport } from '../../src/worker/core-host.js';
import type { CoreLog } from '../../src/worker/core-log.js';
import { OnboardingMachine } from '../../src/worker/onboarding-machine.js';
import type { HostEvent, MainCommand } from '../../src/shared/host-protocol.js';
import type { AppPaths } from '../../src/shared/paths.js';
import type { LoginOutcome } from '../../src/shared/onboarding.js';
import type { SessionProvider } from '../../src/worker/session-provider.js';

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
});
