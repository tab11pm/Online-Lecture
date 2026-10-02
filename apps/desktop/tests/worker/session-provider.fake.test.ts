import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeSessionProvider } from '../../src/worker/session-provider.fake.js';

let dir: string;
let authStatePath: string;
const provider = new FakeSessionProvider();

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'online-lecture-fake-session-'));
  authStatePath = join(dir, 'auth.json');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

describe('FakeSessionProvider', () => {
  it('writes a synthetic storage state on credential login', async () => {
    const outcome = await provider.loginWithCredentials({
      username: 'student',
      password: 'secret',
      authStatePath,
    });

    expect(outcome).toEqual({ ok: true });
    expect(JSON.parse(await readFile(authStatePath, 'utf8'))).toEqual({
      cookies: [],
      origins: [],
    });
  });

  it('reports a captcha challenge without writing state', async () => {
    vi.stubEnv('ONLINE_LECTURE_FAKE_SSO', 'captcha');

    const outcome = await provider.loginWithCredentials({
      username: 'student',
      password: 'secret',
      authStatePath,
    });

    expect(outcome).toEqual({ ok: false, reason: 'captcha' });
    await expect(readFile(authStatePath, 'utf8')).rejects.toThrow();
  });

  it('writes the synthetic state on manual login', async () => {
    const outcome = await provider.openManualLogin(authStatePath);

    expect(outcome).toEqual({ ok: true });
    expect(JSON.parse(await readFile(authStatePath, 'utf8'))).toEqual({
      cookies: [],
      origins: [],
    });
  });

  it('reports an active session unless expired', async () => {
    await expect(provider.checkSession(authStatePath)).resolves.toBe(true);

    vi.stubEnv('ONLINE_LECTURE_FAKE_SESSION_EXPIRED', '1');
    await expect(provider.checkSession(authStatePath)).resolves.toBe(false);
  });
});
