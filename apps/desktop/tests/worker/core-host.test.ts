import { describe, it, expect, vi } from 'vitest';
import { CoreHost, type HostTransport } from '../../src/worker/core-host.js';
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

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('CoreHost', () => {
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
      machine: machine({
        checkSession: vi
          .fn()
          .mockRejectedValue(new Error('failed at bbb2.tusur.ru/b/abc')),
      }),
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
      machine: machine({
        checkSession: vi
          .fn()
          .mockRejectedValue(
            new Error('cookie: session=abc https://tusur.ru/?token=xyz'),
          ),
      }),
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
});
