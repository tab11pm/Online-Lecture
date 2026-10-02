import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TusurSessionProvider,
  type BrowserContextLike,
  type BrowserLauncher,
  type SessionPage,
} from '../../src/worker/tusur-session.js';
import { LOGIN_URL } from '../../src/worker/tusur-detect.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  readFileSync(join(here, '../fixtures/tusur', name), 'utf8');

const AUTH_STATE = '/tmp/tusur-test-auth.json';

function fakeLauncher(contentSequence: string[]) {
  const queue = [...contentSequence];
  const content = vi.fn(async (): Promise<string> => {
    if (queue.length > 1) {
      return queue.shift() ?? '';
    }
    return queue[0] ?? '';
  });
  const goto = vi.fn(async (): Promise<unknown> => null);
  const fill = vi.fn(async (): Promise<void> => undefined);
  const click = vi.fn(async (): Promise<void> => undefined);
  const waitForTimeout = vi.fn(async (): Promise<void> => undefined);
  const storageState = vi.fn(async (): Promise<unknown> => ({}));
  const contextClose = vi.fn(async (): Promise<void> => undefined);

  const page: SessionPage = {
    goto,
    url: () => LOGIN_URL,
    content,
    fill,
    click,
    waitForTimeout,
    close: async () => undefined,
  };
  const context: BrowserContextLike = {
    newPage: async () => page,
    storageState,
    close: contextClose,
  };
  const launch = vi.fn(async (): Promise<BrowserContextLike> => context);

  return {
    launcher: launch as unknown as BrowserLauncher,
    launch,
    page,
    goto,
    fill,
    click,
    storageState,
    contextClose,
  };
}

describe('TusurSessionProvider.loginWithCredentials', () => {
  it('saves the storage state after a successful credentials login', async () => {
    const f = fakeLauncher([
      fixture('login-form.html'),
      fixture('logged-in.html'),
    ]);
    const provider = new TusurSessionProvider(f.launcher);

    const outcome = await provider.loginWithCredentials({
      username: 'student-00000',
      password: 'synthetic-password',
      authStatePath: AUTH_STATE,
    });

    expect(outcome).toEqual({ ok: true });
    expect(f.goto).toHaveBeenCalledWith(LOGIN_URL);
    expect(f.fill).toHaveBeenCalledWith(
      expect.stringContaining('username'),
      'student-00000',
    );
    expect(f.fill).toHaveBeenCalledWith(
      expect.stringContaining('password'),
      'synthetic-password',
    );
    expect(f.click).toHaveBeenCalledTimes(1);
    expect(f.storageState).toHaveBeenCalledWith({ path: AUTH_STATE });
    expect(f.contextClose).toHaveBeenCalledTimes(1);
  });

  it('returns captcha without saving the storage state', async () => {
    const f = fakeLauncher([fixture('captcha.html')]);
    const provider = new TusurSessionProvider(f.launcher);

    const outcome = await provider.loginWithCredentials({
      username: 'student-00000',
      password: 'synthetic-password',
      authStatePath: AUTH_STATE,
    });

    expect(outcome).toEqual({ ok: false, reason: 'captcha' });
    expect(f.storageState).not.toHaveBeenCalled();
    expect(f.fill).not.toHaveBeenCalled();
  });

  it('returns two_factor without saving the storage state', async () => {
    const f = fakeLauncher([fixture('two-factor.html')]);
    const provider = new TusurSessionProvider(f.launcher);

    const outcome = await provider.loginWithCredentials({
      username: 'student-00000',
      password: 'synthetic-password',
      authStatePath: AUTH_STATE,
    });

    expect(outcome).toEqual({ ok: false, reason: 'two_factor' });
    expect(f.storageState).not.toHaveBeenCalled();
  });

  it('reports invalid when the login form reappears after submitting', async () => {
    const f = fakeLauncher([
      fixture('login-form.html'),
      fixture('login-form.html'),
    ]);
    const provider = new TusurSessionProvider(f.launcher);

    const outcome = await provider.loginWithCredentials({
      username: 'student-00000',
      password: 'wrong-password',
      authStatePath: AUTH_STATE,
    });

    expect(outcome).toEqual({ ok: false, reason: 'invalid' });
    expect(f.storageState).not.toHaveBeenCalled();
  });
});

describe('TusurSessionProvider.openManualLogin', () => {
  it('saves the storage state once the authenticated page is reached', async () => {
    const f = fakeLauncher([fixture('logged-in.html')]);
    const provider = new TusurSessionProvider(f.launcher);

    const outcome = await provider.openManualLogin(AUTH_STATE);

    expect(outcome).toEqual({ ok: true });
    expect(f.launch).toHaveBeenCalledWith(
      expect.objectContaining({ headless: false }),
    );
    expect(f.storageState).toHaveBeenCalledWith({ path: AUTH_STATE });
  });
});

describe('TusurSessionProvider.checkSession', () => {
  it('returns true for an existing state on the authenticated page', async () => {
    const f = fakeLauncher([fixture('logged-in.html')]);
    const provider = new TusurSessionProvider(f.launcher);

    await expect(provider.checkSession(AUTH_STATE)).resolves.toBe(true);
    expect(f.launch).toHaveBeenCalledWith(
      expect.objectContaining({ authStatePath: AUTH_STATE }),
    );
  });

  it('returns false when the stored session has expired', async () => {
    const f = fakeLauncher([fixture('login-form.html')]);
    const provider = new TusurSessionProvider(f.launcher);

    await expect(provider.checkSession(AUTH_STATE)).resolves.toBe(false);
    expect(f.storageState).not.toHaveBeenCalled();
  });
});
