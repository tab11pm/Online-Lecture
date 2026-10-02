import type { LoginOutcome } from '../shared/onboarding.js';
import type { LoginCredentials, SessionProvider } from './session-provider.js';
import {
  LOGIN_URL,
  detectLoginState,
  type LoginDetection,
} from './tusur-detect.js';

export interface SessionPage {
  goto(
    url: string,
    options?: { waitUntil?: 'domcontentloaded' | 'load' | 'networkidle' },
  ): Promise<unknown>;
  url(): string;
  content(): Promise<string>;
  fill(selector: string, value: string): Promise<void>;
  click(selector: string, options?: { timeout?: number }): Promise<void>;
  waitForLoadState?(
    state?: 'domcontentloaded' | 'load' | 'networkidle',
  ): Promise<void>;
  waitForTimeout?(milliseconds: number): Promise<void>;
  close(): Promise<void>;
}

export interface BrowserContextLike {
  newPage(): Promise<SessionPage>;
  storageState(options?: { path?: string }): Promise<unknown>;
  close(): Promise<void>;
}

export interface BrowserLaunchOptions {
  headless: boolean;
  authStatePath?: string;
}

export type BrowserLauncher = (
  options: BrowserLaunchOptions,
) => Promise<BrowserContextLike>;

export interface TusurSessionProviderOptions {
  manualLoginTimeoutMs?: number;
  pollIntervalMs?: number;
}

export const SELECTORS = {
  username: 'input[name="username"]',
  password: 'input[name="password"]',
  submit: 'button[type="submit"], input[type="submit"]',
} as const;

const DEFAULT_MANUAL_LOGIN_TIMEOUT_MS = 300_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const LOGIN_ERROR_MESSAGE = 'Не удалось выполнить вход в ТУСУР.';

export class TusurSessionProvider implements SessionProvider {
  private readonly manualLoginTimeoutMs: number;
  private readonly pollIntervalMs: number;

  constructor(
    private readonly launch: BrowserLauncher,
    options: TusurSessionProviderOptions = {},
  ) {
    this.manualLoginTimeoutMs =
      options.manualLoginTimeoutMs ?? DEFAULT_MANUAL_LOGIN_TIMEOUT_MS;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  async loginWithCredentials(input: LoginCredentials): Promise<LoginOutcome> {
    const { username, password, authStatePath } = input;
    let context: BrowserContextLike | undefined;
    try {
      context = await this.launch({ headless: true });
      const page = await context.newPage();
      await page.goto(LOGIN_URL);

      const initial = detectLoginState(await page.content());
      if (initial === 'captcha' || initial === 'two_factor') {
        return { ok: false, reason: initial };
      }
      if (initial === 'logged_in') {
        await context.storageState({ path: authStatePath });
        return { ok: true };
      }

      await page.fill(SELECTORS.username, username);
      await page.fill(SELECTORS.password, password);
      await page.click(SELECTORS.submit);

      const afterSubmit = await this.waitForSettledState(page);
      if (afterSubmit === 'logged_in') {
        await context.storageState({ path: authStatePath });
        return { ok: true };
      }
      if (afterSubmit === 'captcha' || afterSubmit === 'two_factor') {
        return { ok: false, reason: afterSubmit };
      }
      return { ok: false, reason: 'invalid' };
    } catch {
      return { ok: false, reason: 'error', message: LOGIN_ERROR_MESSAGE };
    } finally {
      if (context) {
        await safeClose(context);
      }
    }
  }

  async openManualLogin(authStatePath: string): Promise<LoginOutcome> {
    let context: BrowserContextLike | undefined;
    try {
      context = await this.launch({ headless: false });
      const page = await context.newPage();
      await page.goto(LOGIN_URL);

      const state = await this.waitForManualLogin(page);
      if (state === 'logged_in') {
        await context.storageState({ path: authStatePath });
        return { ok: true };
      }
      if (state === 'captcha' || state === 'two_factor') {
        return { ok: false, reason: state };
      }
      return { ok: false, reason: 'error', message: LOGIN_ERROR_MESSAGE };
    } catch {
      return { ok: false, reason: 'error', message: LOGIN_ERROR_MESSAGE };
    } finally {
      if (context) {
        await safeClose(context);
      }
    }
  }

  async checkSession(authStatePath: string): Promise<boolean> {
    let context: BrowserContextLike | undefined;
    try {
      context = await this.launch({ headless: true, authStatePath });
      const page = await context.newPage();
      await page.goto(LOGIN_URL);
      return detectLoginState(await page.content()) === 'logged_in';
    } catch {
      return false;
    } finally {
      if (context) {
        await safeClose(context);
      }
    }
  }

  private async waitForSettledState(
    page: SessionPage,
  ): Promise<LoginDetection> {
    if (page.waitForLoadState) {
      try {
        await page.waitForLoadState('networkidle');
      } catch {
        // Navigation may already be complete; fall back to the current DOM.
      }
    }
    return detectLoginState(await page.content());
  }

  private async waitForManualLogin(page: SessionPage): Promise<LoginDetection> {
    const deadline = Date.now() + this.manualLoginTimeoutMs;
    let state = detectLoginState(await page.content());
    while (state !== 'logged_in' && Date.now() < deadline) {
      await this.delay(page);
      state = detectLoginState(await page.content());
    }
    return state;
  }

  private async delay(page: SessionPage): Promise<void> {
    if (page.waitForTimeout) {
      await page.waitForTimeout(this.pollIntervalMs);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
  }
}

async function safeClose(context: BrowserContextLike): Promise<void> {
  try {
    await context.close();
  } catch {
    // Best-effort cleanup; the login outcome was already determined.
  }
}
