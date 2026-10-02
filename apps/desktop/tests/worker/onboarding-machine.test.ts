import { describe, it, expect, vi } from 'vitest';
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
});
