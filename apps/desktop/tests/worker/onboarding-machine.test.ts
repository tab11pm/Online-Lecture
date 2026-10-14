import { describe, it, expect, vi } from 'vitest';
import { SdoMcpUnavailableError } from '@core/core/mcp-errors.js';
import { OnboardingMachine } from '../../src/worker/onboarding-machine.js';

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

describe('OnboardingMachine', () => {
  it('starts in welcome and emits changes', () => {
    const m = machine();
    const seen: string[] = [];
    m.onChange((s) => seen.push(s.phase));
    m.start();
    expect(seen).toEqual(['welcome']);
  });

  it('goes credentials -> authenticating -> session_ready on success', async () => {
    const m = machine();
    await expect(
      m.submitCredentials({ username: 'u', password: 'p' }),
    ).resolves.toMatchObject({ phase: 'session_ready' });
  });

  it('routes captcha to manual_sso and saves the session on manual success', async () => {
    const m = machine({
      login: vi.fn().mockResolvedValue({ ok: false, reason: 'captcha' }),
    });
    await expect(
      m.submitCredentials({ username: 'u', password: 'p' }),
    ).resolves.toMatchObject({ phase: 'manual_sso' });
    await expect(m.openManualSso()).resolves.toMatchObject({
      phase: 'session_ready',
    });
  });

  it('returns to credentials with an error on invalid credentials', async () => {
    const m = machine({
      login: vi.fn().mockResolvedValue({ ok: false, reason: 'invalid' }),
    });
    const state = await m.submitCredentials({ username: 'u', password: 'p' });
    expect(state).toMatchObject({ phase: 'credentials' });
    expect((state as { error?: string }).error).toBeTruthy();
  });

  it('ignores a second submit while authenticating', async () => {
    let resolveLogin!: (v: unknown) => void;
    const login = vi.fn().mockImplementation(
      () =>
        new Promise((r) => {
          resolveLogin = r;
        }),
    );
    const m = machine({ login });
    const first = m.submitCredentials({ username: 'u', password: 'p' });
    await m.submitCredentials({ username: 'u', password: 'p' });
    resolveLogin({ ok: true });
    await first;
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('treats a closed/failed manual window as credentials, not authenticating', async () => {
    const m = machine({
      login: vi.fn().mockResolvedValue({ ok: false, reason: 'captcha' }),
      openManualSso: vi
        .fn()
        .mockResolvedValue({ ok: false, reason: 'error', message: 'closed' }),
    });
    await m.submitCredentials({ username: 'u', password: 'p' });
    const state = await m.openManualSso();
    expect(state).toMatchObject({ phase: 'credentials' });
  });

  it('returns to credentials when checkSession reports an expired session', async () => {
    const m = machine({ checkSession: vi.fn().mockResolvedValue(false) });
    expect(await m.checkSession()).toMatchObject({ phase: 'credentials' });
  });

  it('returns to credentials with an error instead of throwing when the session check fails', async () => {
    const m = machine({
      checkSession: vi
        .fn()
        .mockRejectedValue(new Error('MCP error -32000: Connection closed')),
    });

    await expect(m.checkSession()).resolves.toMatchObject({
      phase: 'credentials',
    });
    const state = await m.checkSession();
    expect((state as { error?: string }).error).toBeTruthy();
  });

  describe('when SDO MCP is unavailable', () => {
    const NOT_FOUND =
      'Компонент входа SDO MCP не найден. Переустановите приложение.';
    const commands = [
      ['checkSession', (m: OnboardingMachine) => m.checkSession()],
      [
        'submitCredentials',
        (m: OnboardingMachine) =>
          m.submitCredentials({ username: 'u', password: 'p' }),
      ],
      ['openManualSso', (m: OnboardingMachine) => m.openManualSso()],
    ] as const;

    function unavailable(reason: 'not_found' | 'exited' | 'timeout') {
      const error = new SdoMcpUnavailableError(reason, 'bundled', '');
      return {
        login: vi.fn().mockRejectedValue(error),
        openManualSso: vi.fn().mockRejectedValue(error),
        checkSession: vi.fn().mockRejectedValue(error),
      };
    }

    it.each(commands)(
      '%s shows the not-found message when SDO MCP is missing',
      async (_, run) => {
        const m = machine(unavailable('not_found'));

        await expect(run(m)).resolves.toEqual({
          phase: 'failed',
          message: NOT_FOUND,
        });
      },
    );

    it.each(commands)(
      '%s shows the not-started message with the log path',
      async (_, run) => {
        const m = machine({
          ...unavailable('timeout'),
          logPath: 'C:\\logs\\core.log',
        });

        await expect(run(m)).resolves.toEqual({
          phase: 'failed',
          message:
            'Компонент входа SDO MCP не запустился. Подробности в журнале: C:\\logs\\core.log.',
        });
      },
    );

    it('falls back to a generic log hint without a log path', async () => {
      const m = machine(unavailable('exited'));

      await expect(m.checkSession()).resolves.toEqual({
        phase: 'failed',
        message:
          'Компонент входа SDO MCP не запустился. Подробности в журнале приложения.',
      });
    });

    it('reports every caught error to onError', async () => {
      const missing = new SdoMcpUnavailableError('not_found', 'path', '');
      const broken = new Error('MCP error -32603: boom');
      const onError = vi.fn();
      const m = machine({
        checkSession: vi
          .fn()
          .mockRejectedValueOnce(missing)
          .mockRejectedValueOnce(broken),
        onError,
      });

      await m.checkSession();
      await m.checkSession();

      expect(onError).toHaveBeenNthCalledWith(1, missing);
      expect(onError).toHaveBeenNthCalledWith(2, broken);
    });
  });

  it('requireLogin returns to credentials with the expiry message', async () => {
    const m = machine();
    const seen: unknown[] = [];
    m.onChange((s) => seen.push(s));
    await m.checkSession();
    m.requireLogin('Сессия ТУСУР истекла. Войдите снова.');
    expect(m.getState()).toEqual({
      phase: 'credentials',
      error: 'Сессия ТУСУР истекла. Войдите снова.',
    });
    expect(seen.at(-1)).toEqual(m.getState());
  });
});
