import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { LoginOutcome } from '../shared/onboarding.js';
import type { LoginCredentials, SessionProvider } from './session-provider.js';

const SYNTHETIC_AUTH_STATE = JSON.stringify({ cookies: [], origins: [] });

/**
 * In-memory stand-in for {@link SessionProvider}. It never touches Playwright
 * or the real TUSUR SSO: it only writes a synthetic, empty storage-state file so
 * downstream code has an `auth.json` to read. Enabled through the
 * `ONLINE_LECTURE_FAKE_SESSION=1` entry switch for E2E and local smoke runs.
 */
export class FakeSessionProvider implements SessionProvider {
  async loginWithCredentials(input: LoginCredentials): Promise<LoginOutcome> {
    if (process.env.ONLINE_LECTURE_FAKE_SSO === 'captcha') {
      return { ok: false, reason: 'captcha' };
    }
    await writeAuthState(input.authStatePath);
    return { ok: true };
  }

  async openManualLogin(authStatePath: string): Promise<LoginOutcome> {
    await writeAuthState(authStatePath);
    return { ok: true };
  }

  async checkSession(authStatePath: string): Promise<boolean> {
    void authStatePath;
    return process.env.ONLINE_LECTURE_FAKE_SESSION_EXPIRED !== '1';
  }
}

async function writeAuthState(authStatePath: string): Promise<void> {
  await mkdir(dirname(authStatePath), { recursive: true });
  await writeFile(authStatePath, SYNTHETIC_AUTH_STATE, 'utf8');
}
