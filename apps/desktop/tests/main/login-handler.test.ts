import { describe, expect, it, vi } from 'vitest';
import { createLoginHandler } from '../../src/main/login-handler.js';
import type { LoginOutcome } from '../../src/shared/onboarding.js';

const INPUT = { username: 'student', password: 'super-secret-password' };

function setup(outcome: LoginOutcome | Error) {
  const secretStore = { save: vi.fn().mockResolvedValue(undefined) };
  const settingsStore = { update: vi.fn().mockResolvedValue({}) };
  const core = {
    login:
      outcome instanceof Error
        ? vi.fn().mockRejectedValue(outcome)
        : vi.fn().mockResolvedValue(outcome),
  };
  const handle = createLoginHandler({ secretStore, settingsStore, core });
  return { handle, secretStore, settingsStore, core };
}

describe('createLoginHandler', () => {
  it('saves the credentials after a successful login', async () => {
    const { handle, secretStore, settingsStore, core } = setup({ ok: true });

    await expect(handle(INPUT)).resolves.toEqual({ ok: true });

    expect(core.login).toHaveBeenCalledWith(INPUT);
    expect(secretStore.save).toHaveBeenCalledWith(INPUT.password);
    expect(settingsStore.update).toHaveBeenCalledWith({
      username: INPUT.username,
    });
  });

  it('does not save the credentials when the login fails', async () => {
    const { handle, secretStore, settingsStore } = setup({
      ok: false,
      reason: 'invalid',
    });

    await expect(handle(INPUT)).resolves.toMatchObject({ ok: false });

    expect(secretStore.save).not.toHaveBeenCalled();
    expect(settingsStore.update).not.toHaveBeenCalled();
  });

  it('does not save the credentials when the login request rejects', async () => {
    const { handle, secretStore, settingsStore } = setup(
      new Error('worker restarted'),
    );

    await expect(handle(INPUT)).rejects.toThrow('worker restarted');

    expect(secretStore.save).not.toHaveBeenCalled();
    expect(settingsStore.update).not.toHaveBeenCalled();
  });
});
