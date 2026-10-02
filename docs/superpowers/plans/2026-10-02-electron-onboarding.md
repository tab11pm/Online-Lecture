# Electron Onboarding, TUSUR Auth and Tray — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first Phase 3 vertical slice: a Windows Electron app that runs onboarding, obtains the shared TUSUR `.tusur.ru` session as a Playwright storage state, and lives in the tray.

**Architecture:** Three processes. Electron **main** owns lifecycle, windows, tray, autostart and `safeStorage`. A Node **utility process** (`core-host`) owns the onboarding state machine, TUSUR login via Playwright, and later SQLite/Scheduler. A React **renderer** talks only through a narrow typed preload bridge. The existing core under `src/` stays Electron-free and is imported by alias where needed.

**Tech Stack:** TypeScript (ESM), Electron 44, electron-vite 5, electron-builder 26 (config only this slice), React 19, Vite 6 plugin-react, Vitest, @testing-library/react, jsdom, Playwright (already present).

**Spec:** `docs/superpowers/specs/2026-10-02-electron-onboarding-design.md`

## Global Constraints

- Windows 10/11 is the target; Linux dev/CI mirrors behavior behind injectable interfaces.
- Renderer: `nodeIntegration: false`, `contextIsolation: true`, only `window.desktop`.
- Password stored only via Electron `safeStorage` (DPAPI on Windows); plaintext fallback only when `isAvailable()` is false, and never silently on Windows.
- Never log passwords, cookies, join URLs or `sessionToken`; route error text through `redactSensitiveText` from `src/core/redaction.ts`.
- Shared session file is `auth.json` (Playwright storage state, mode `0600`); MCP reads it via `SDO_AUTH_STATE_PATH`, timetable import via `--auth-state`.
- Data root is `app.getPath('userData')` → `%LOCALAPPDATA%/OnlineLecture`; renderer never receives data paths.
- New/edited files must be clean under `prettier` and add no new `eslint` errors.
- Exact dependency versions: electron `^44.5.1`, electron-vite `^5.0.0`, electron-builder `^26.15.3`, react/react-dom `^19.3.0`, @vitejs/plugin-react `^6.1.1`, @testing-library/react `^16.3.3`.

## Review Focus

Inputs/conditions the spec implies but no task naturally tests; each gets a test in the owning task.

1. Corrupted `credentials.enc` or `settings.json` (truncated/invalid JSON) — must be treated as absent with a warning, never crash startup. → Tasks 3, 4.
2. `safeStorage.isAvailable() === false` — fallback must be explicit and marked; on Windows a false return must not silently store plaintext. → Task 3.
3. Manual SSO window closed by the user without logging in — machine must return to `credentials`/`failed`, never hang in `authenticating`. → Task 5.
4. Double submit / repeated login while `authenticating` — machine ignores the extra call (idempotent), no two Chromium browsers. → Task 5.
5. Unexpected/extra host message from renderer — main and host ignore it without throwing. → Tasks 6, 7.
6. Expired `auth.json` mid-flow — `checkSession` returns false and the machine returns to `credentials`. → Task 5.

---

## File Structure

```
apps/desktop/
  package.json                     # @online-lecture/desktop, deps above
  electron.vite.config.ts          # main/preload/renderer, externalize electron/better-sqlite3/playwright
  tsconfig.json                    # references node/web
  tsconfig.node.json               # main + preload + worker + shared
  tsconfig.web.json                # renderer + shared
  vitest.config.ts                 # node env by default; jsdom per renderer test
  src/shared/onboarding.ts         # OnboardingState, LoginOutcome types
  src/shared/host-protocol.ts      # main <-> host message unions
  src/shared/ipc-contract.ts       # channel names + DesktopApi type
  src/shared/paths.ts              # createAppPaths(userDataDir)
  src/worker/onboarding-machine.ts # pure state machine
  src/worker/session-provider.ts   # SessionProvider interface
  src/worker/tusur-detect.ts       # pure HTML detection + selectors
  src/worker/tusur-session.ts      # Playwright implementation
  src/worker/core-host.ts          # transport wiring
  src/main/paths.ts                # wire userData dir -> AppPaths
  src/main/secret-store.ts         # SecretStore over injected backend
  src/main/settings-store.ts       # settings.json
  src/main/autostart.ts            # setLoginItemSettings wrapper
  src/main/window.ts               # BrowserWindow factory + hide-on-close
  src/main/tray.ts                 # Tray factory + menu
  src/main/ipc.ts                  # ipcMain handlers
  src/main/index.ts                # app lifecycle
  src/preload/index.ts             # contextBridge -> window.desktop
  src/renderer/index.html
  src/renderer/src/main.tsx
  src/renderer/src/App.tsx
  src/renderer/src/api.ts
  src/renderer/src/components/CredentialsForm.tsx
  src/renderer/src/components/SessionReady.tsx
  src/renderer/src/components/ManualSsoPanel.tsx
  tests/                           # vitest specs (node + jsdom)
  tests/fixtures/tusur/*.html      # anonymized login pages
```

`src/` (core) is imported by the host only where needed. `@core` alias → repository root `src/`.

---

### Task 1: Scaffold the `apps/desktop` workspace and runnable shell

**Files:**
- Modify: `package.json` (root)
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/electron.vite.config.ts`
- Create: `apps/desktop/tsconfig.json`, `apps/desktop/tsconfig.node.json`, `apps/desktop/tsconfig.web.json`
- Create: `apps/desktop/vitest.config.ts`
- Create: `apps/desktop/src/main/index.ts`
- Create: `apps/desktop/src/preload/index.ts`
- Create: `apps/desktop/src/renderer/index.html`, `src/renderer/src/main.tsx`, `src/renderer/src/App.tsx`
- Create: `apps/desktop/src/renderer/src/api.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: workspace package `@online-lecture/desktop`; scripts `dev`, `build`, `typecheck`, `test`; `src/renderer/src/api.ts` exporting `export const desktop = window.desktop;`.

- [ ] **Step 1: Add root workspaces and scripts**

Root `package.json`: add `"workspaces": ["apps/*"]`; change `"build": "tsc --noEmit && npm run typecheck -w @online-lecture/desktop"` and `"test": "vitest run --passWithNoTests && npm test -w @online-lecture/desktop"`.

- [ ] **Step 2: Create `apps/desktop/package.json`**

Name `@online-lecture/desktop`, `"private": true`, `"type": "module"`, `"main": "out/main/index.js"`. Scripts: `dev: electron-vite dev`, `build: electron-vite build`, `typecheck: tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json`, `test: vitest run`, `start: electron-vite preview`. Dependencies: `react`, `react-dom`, `@modelcontextprotocol/sdk`, `playwright`; devDependencies: `electron`, `electron-vite`, `electron-builder`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `typescript`, `vitest`, plus the root's `@types/*` where needed.

- [ ] **Step 3: Configure electron-vite**

`electron.vite.config.ts` with three sections (`main`, `preload`, `renderer`), `renderer.root = 'src/renderer'`, react plugin, `resolve.alias` mapping `@core` → repository `src`, and `build.rollupOptions.external` for `electron`, `better-sqlite3`, `playwright`.

- [ ] **Step 4: Minimal shell**

`main/index.ts` creates a `BrowserWindow` (loads `../renderer/index.html` in dev, bundled file in prod) with `webPreferences: { preload, sandbox: false, contextIsolation: true, nodeIntegration: false }`. `preload/index.ts` exposes an empty-ish `window.desktop` placeholder built on `contextBridge` + `ipcRenderer`. `App.tsx` renders `<h1>Online Lecture</h1>`.

- [ ] **Step 5: Add a smoke test**

Create `apps/desktop/tests/smoke.test.ts` asserting `1 + 1 === 2` (placeholder that exercises vitest config).

- [ ] **Step 6: Verify**

Run: `npm install` then `npm run typecheck -w @online-lecture/desktop` → exit 0. Run: `npm test -w @online-lecture/desktop` → 1 passed. Run: `npm run build -w @online-lecture/desktop` → `out/` produced.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json apps/desktop
git commit -m "feat(desktop): scaffold electron-vite workspace shell"
```

> If `electron` download is blocked in this environment, keep the scaffold and mark Electron-launch verification as manual; all pure-logic tests in later tasks remain runnable without launching Electron.

---

### Task 2: Shared types, IPC contract and host protocol

**Files:**
- Create: `apps/desktop/src/shared/onboarding.ts`
- Create: `apps/desktop/src/shared/ipc-contract.ts`
- Create: `apps/desktop/src/shared/host-protocol.ts`
- Create: `apps/desktop/src/shared/paths.ts`
- Test: `apps/desktop/tests/shared/paths.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `OnboardingState`, `LoginOutcome`, `AppPaths`/`createAppPaths`, channel constants and `DesktopApi`, `MainCommand`/`HostEvent` unions.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { createAppPaths } from '../../src/shared/paths.js';

describe('createAppPaths', () => {
  it('derives every path from the userData directory', () => {
    const root = join('data', 'OnlineLecture');
    const paths = createAppPaths(root);
    expect(paths.database).toBe(join(root, 'data', 'lectures.db'));
    expect(paths.authState).toBe(join(root, 'auth.json'));
    expect(paths.credentials).toBe(join(root, 'credentials.enc'));
    expect(paths.settings).toBe(join(root, 'settings.json'));
    expect(paths.logs).toBe(join(root, 'logs'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @online-lecture/desktop -- paths` → FAIL (module not found).

- [ ] **Step 3: Implement the shared modules**

`onboarding.ts`:

```ts
export type OnboardingState =
  | { phase: 'welcome' }
  | { phase: 'credentials'; error?: string }
  | { phase: 'authenticating' }
  | { phase: 'manual_sso' }
  | { phase: 'session_ready' }
  | { phase: 'failed'; message: string };

export type LoginOutcome =
  | { ok: true }
  | { ok: false; reason: 'captcha' | 'two_factor' | 'invalid' | 'error'; message?: string };
```

`paths.ts`: `AppPaths { root; database; authState; credentials; settings; logs }` and `createAppPaths(userDataDir)` using `node:path.join`. Keep the function pure (return paths only); directory creation happens in the main/host startup.

`ipc-contract.ts`: channel constants object, `AppInfo { version: string; autostart: boolean }`, `CoreStatus = 'idle' | 'starting' | 'running' | 'stopped' | 'error'`, and the `DesktopApi` interface with `onboarding`, `app`, `core` groups exactly as in the spec §8.

`host-protocol.ts`: `MainCommand` (`onboarding.login`, `onboarding.openManualSso`, `onboarding.checkSession`, `onboarding.getState`, `app.paths`) and `HostEvent` (`onboarding.changed`, `onboarding.loginResult`, `host.error`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @online-lecture/desktop -- paths` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/shared apps/desktop/tests/shared
git commit -m "feat(desktop): add shared types, IPC contract and app paths"
```

---

### Task 3: SecretStore over an injectable encryption backend

**Files:**
- Create: `apps/desktop/src/main/secret-store.ts`
- Test: `apps/desktop/tests/main/secret-store.test.ts`

**Interfaces:**
- Consumes: `node:fs/promises`, `node:path`.
- Produces: `EncryptionBackend { isAvailable(): boolean; encryptString(s: string): Buffer; decryptString(b: Buffer): string }` and `SecretStore { save(password): Promise<void>; load(): Promise<string | undefined>; clear(): Promise<void> }`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SecretStore, type EncryptionBackend } from '../../src/main/secret-store.js';

const base64Backend: EncryptionBackend = {
  isAvailable: () => true,
  encryptString: (s) => Buffer.from(s, 'utf8'),
  decryptString: (b) => b.toString('utf8'),
};
const unavailable: EncryptionBackend = {
  isAvailable: () => false,
  encryptString: (s) => Buffer.from(s, 'utf8'),
  decryptString: (b) => b.toString('utf8'),
};

describe('SecretStore', () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'secret-')); });

  it('round-trips a password and never stores it in plaintext', async () => {
    const store = new SecretStore(join(dir, 'credentials.enc'), base64Backend);
    await store.save('s3cret');
    expect(await store.load()).toBe('s3cret');
    expect((await readFile(join(dir, 'credentials.enc'))).toString('utf8')).not.toContain('s3cret');
  });

  it('returns undefined when the file is missing', async () => {
    const store = new SecretStore(join(dir, 'absent.enc'), base64Backend);
    expect(await store.load()).toBeUndefined();
  });

  it('treats corrupted content as absent instead of throwing', async () => {
    const file = join(dir, 'bad.enc');
    await writeFile(file, 'not-json');
    const store = new SecretStore(file, base64Backend);
    expect(await store.load()).toBeUndefined();
  });

  it('marks the payload when encryption is unavailable', async () => {
    const file = join(dir, 'plain.enc');
    const store = new SecretStore(file, unavailable);
    await store.save('s3cret');
    const written = JSON.parse((await readFile(file)).toString('utf8'));
    expect(written.encrypted).toBe(false);
    expect(await store.load()).toBe('s3cret');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @online-lecture/desktop -- secret-store` → FAIL.

- [ ] **Step 3: Implement `SecretStore`**

File format `{ v: 1, encrypted: boolean, data: <base64> }`. `load` JSON-parses, validates `v === 1` and string `data`, base64-decodes, and returns `undefined` on any error. `save` writes with mode `0o600`. Log a warning (no secret) when `!backend.isAvailable()`. Do not decide the Windows policy here; the backend's `isAvailable()` encodes it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @online-lecture/desktop -- secret-store` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/secret-store.ts apps/desktop/tests/main/secret-store.test.ts
git commit -m "feat(desktop): add DPAPI-backed SecretStore with explicit fallback"
```

---

### Task 4: SettingsStore

**Files:**
- Create: `apps/desktop/src/main/settings-store.ts`
- Test: `apps/desktop/tests/main/settings-store.test.ts`

**Interfaces:**
- Consumes: `SecretStore` pattern (injectable fs path).
- Produces: `AppSettings { autostart: boolean }` and `SettingsStore { read(): Promise<AppSettings>; update(patch: Partial<AppSettings>): Promise<AppSettings> }`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SettingsStore } from '../../src/main/settings-store.js';

describe('SettingsStore', () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'settings-')); });

  it('defaults to autostart disabled', async () => {
    const store = new SettingsStore(join(dir, 'settings.json'));
    expect(await store.read()).toEqual({ autostart: false });
  });

  it('persists an update and merges patches', async () => {
    const store = new SettingsStore(join(dir, 'settings.json'));
    expect(await store.update({ autostart: true })).toEqual({ autostart: true });
    expect(await new SettingsStore(join(dir, 'settings.json')).read()).toEqual({ autostart: true });
  });

  it('falls back to defaults on corrupted JSON', async () => {
    const file = join(dir, 'settings.json');
    await writeFile(file, '{ not json');
    expect(await new SettingsStore(file).read()).toEqual({ autostart: false });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail** → `npm test -w @online-lecture/desktop -- settings-store` → FAIL.

- [ ] **Step 3: Implement `SettingsStore`**

Read/parse with defaults on missing or invalid; `update` merges, validates `autostart` is boolean, writes pretty JSON. Corrupted file is reported via warning and replaced only on next successful `update`.

- [ ] **Step 4: Run tests to verify they pass** → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/settings-store.ts apps/desktop/tests/main/settings-store.test.ts
git commit -m "feat(desktop): add settings store for autostart"
```

---

### Task 5: Onboarding state machine

**Files:**
- Create: `apps/desktop/src/worker/onboarding-machine.ts`
- Test: `apps/desktop/tests/worker/onboarding-machine.test.ts`

**Interfaces:**
- Consumes: `OnboardingState`, `LoginOutcome` (Task 2).
- Produces: `OnboardingDependencies { login(input: { username: string; password: string }): Promise<LoginOutcome>; openManualSso(): Promise<LoginOutcome>; checkSession(): Promise<boolean> }` and `OnboardingMachine`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi } from 'vitest';
import { OnboardingMachine } from '../../src/worker/onboarding-machine.js';

function machine(overrides: Partial<ConstructorParameters<typeof OnboardingMachine>[0]> = {}) {
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
    await expect(m.submitCredentials({ username: 'u', password: 'p' }))
      .resolves.toMatchObject({ phase: 'session_ready' });
  });

  it('routes captcha to manual_sso and saves the session on manual success', async () => {
    const m = machine({ login: vi.fn().mockResolvedValue({ ok: false, reason: 'captcha' }) });
    await expect(m.submitCredentials({ username: 'u', password: 'p' }))
      .resolves.toMatchObject({ phase: 'manual_sso' });
    await expect(m.openManualSso()).resolves.toMatchObject({ phase: 'session_ready' });
  });

  it('returns to credentials with an error on invalid credentials', async () => {
    const m = machine({ login: vi.fn().mockResolvedValue({ ok: false, reason: 'invalid' }) });
    const state = await m.submitCredentials({ username: 'u', password: 'p' });
    expect(state).toMatchObject({ phase: 'credentials' });
    expect((state as { error?: string }).error).toBeTruthy();
  });

  it('ignores a second submit while authenticating', async () => {
    let resolveLogin!: (v: unknown) => void;
    const login = vi.fn().mockImplementation(() => new Promise((r) => { resolveLogin = r; }));
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
      openManualSso: vi.fn().mockResolvedValue({ ok: false, reason: 'error', message: 'closed' }),
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
```

- [ ] **Step 2: Run tests to verify they fail** → FAIL.

- [ ] **Step 3: Implement `OnboardingMachine`**

Class holding `state`, a `Set` of listeners, and a `busy` guard. `start()` sets `welcome`. `submitCredentials` returns current state immediately when `busy`; otherwise sets `authenticating`, awaits `login`, then `session_ready` / `manual_sso` (captcha, two_factor) / `credentials` with a redacted message (`invalid`, `error`). `openManualSso` sets `manual_sso` while awaiting, then `session_ready` or back to `credentials` with error. `checkSession` returns `session_ready` or `credentials`. Every transition calls `emit()`.

- [ ] **Step 4: Run tests to verify they pass** → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/worker/onboarding-machine.ts apps/desktop/tests/worker/onboarding-machine.test.ts
git commit -m "feat(desktop): add onboarding state machine"
```

---

### Task 6: TUSUR detection helpers and Playwright SessionProvider

**Files:**
- Create: `apps/desktop/src/worker/session-provider.ts`
- Create: `apps/desktop/src/worker/tusur-detect.ts`
- Create: `apps/desktop/src/worker/tusur-session.ts`
- Create: `apps/desktop/tests/fixtures/tusur/login-form.html`, `captcha.html`, `two-factor.html`, `logged-in.html`
- Test: `apps/desktop/tests/worker/tusur-detect.test.ts`, `apps/desktop/tests/worker/tusur-session.test.ts`

**Interfaces:**
- Consumes: Playwright (already in the repo).
- Produces: `SessionProvider { loginWithCredentials(input: { username; password; authStatePath }): Promise<LoginOutcome>; openManualLogin(authStatePath: string): Promise<LoginOutcome>; checkSession(authStatePath: string): Promise<boolean> }`; `detectLoginState(html: string): 'logged_in' | 'captcha' | 'two_factor' | 'form'`; `LOGIN_URL`, `TUSUR_HOSTS`.

- [ ] **Step 1: Write the failing detection tests**

Fixtures are anonymized snapshots: `login-form.html` contains a form posting to `profile.tusur.ru` with username/password fields; `captcha.html` contains a recaptcha container; `two-factor.html` contains a code input; `logged-in.html` contains a logout link and no login form.

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectLoginState } from '../../src/worker/tusur-detect.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(here, '../fixtures/tusur', name), 'utf8');

describe('detectLoginState', () => {
  it('detects the login form', () => expect(detectLoginState(fixture('login-form.html'))).toBe('form'));
  it('detects captcha', () => expect(detectLoginState(fixture('captcha.html'))).toBe('captcha'));
  it('detects two-factor', () => expect(detectLoginState(fixture('two-factor.html'))).toBe('two_factor'));
  it('detects an authenticated page', () => expect(detectLoginState(fixture('logged-in.html'))).toBe('logged_in'));
});
```

- [ ] **Step 2: Run tests to verify they fail** → FAIL.

- [ ] **Step 3: Implement `tusur-detect.ts`**

Pure string checks, order-sensitive: captcha markers → `captcha`; 2FA code input marker → `two_factor`; presence of logout/auth-cookie indicator → `logged_in`; login-form marker → `form`; otherwise `form`. `LOGIN_URL = 'https://profile.tusur.ru/'`; `TUSUR_HOSTS` allowlist.

- [ ] **Step 4: Implement `tusur-session.ts` tests with an injected browser factory**

Define `BrowserLauncher` type `(opts: { headless: boolean }) => Promise<BrowserContextLike>` where `BrowserContextLike` exposes `newPage()`, `storageState({ path })`, `close()`. `TusurSessionProvider` takes the launcher. Test with a fake context returning each fixture HTML from `page.content()` / `page.url()`, asserting: credentials login on `form` resolves `{ ok: true }` and calls `storageState({ path })`; captcha resolves `{ ok: false, reason: 'captcha' }` without saving; manual login on `logged_in` saves the session; `checkSession` loads an existing state and returns true on `logged_in`.

- [ ] **Step 5: Run tests to verify they pass** → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/worker apps/desktop/tests/worker apps/desktop/tests/fixtures
git commit -m "feat(desktop): add TUSUR session provider with fixture-driven detection"
```

> The real `chromium.launch` adapter is thin and only exercised on Windows manually; keep fixture tests independent of a downloaded browser.

---

### Task 7: Core-host worker and transport protocol

**Files:**
- Create: `apps/desktop/src/worker/core-host.ts`
- Test: `apps/desktop/tests/worker/core-host.test.ts`

**Interfaces:**
- Consumes: `OnboardingMachine` (Task 5), `SessionProvider` (Task 6), `AppPaths` (Task 2), `MainCommand`/`HostEvent` (Task 2).
- Produces: `HostTransport { post(event: HostEvent): void; onMessage(handler: (command: MainCommand) => void): void }` and `CoreHost { start(): void; stop(): Promise<void> }`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi } from 'vitest';
import { CoreHost, type HostTransport } from '../../src/worker/core-host.js';

function fakeTransport() {
  const posted: any[] = [];
  let handler: ((c: any) => void) | undefined;
  const transport: HostTransport = {
    post: (e) => posted.push(e),
    onMessage: (h) => { handler = h; },
  };
  return { transport, posted, send: (c: any) => handler?.(c) };
}

const paths = { root: '/d', database: '/d/db', authState: '/d/auth.json', credentials: '/d/c.enc', settings: '/d/s.json', logs: '/d/logs' };

it('emits onboarding state changes over the transport', async () => {
  const { transport, posted, send } = fakeTransport();
  const machine = { start: vi.fn(() => ({ phase: 'welcome' })), onChange: vi.fn() } as any;
  const host = new CoreHost(transport, { machine, paths });
  host.start();
  send({ type: 'onboarding.getState' });
  expect(posted.some((e) => e.type === 'onboarding.changed')).toBe(true);
});

it('ignores unknown commands without throwing', () => {
  const { transport, send } = fakeTransport();
  const host = new CoreHost(transport, { machine: {} as any, paths });
  host.start();
  expect(() => send({ type: 'nonsense.command' })).not.toThrow();
});
```

- [ ] **Step 2: Run tests to verify they fail** → FAIL.

- [ ] **Step 3: Implement `CoreHost`**

Router over `MainCommand.type`; wire `machine.onChange` → `transport.post({ type: 'onboarding.changed', state })`; `onboarding.login` → `machine.submitCredentials`; `onboarding.openManualSso`; `onboarding.checkSession`; `onboarding.getState`; `app.paths` returns `paths`. Unknown types are ignored. A stub `SessionProvider` implementation is constructed from `paths` lazily so tests can inject a machine.

- [ ] **Step 4: Run tests to verify they pass** → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/worker/core-host.ts apps/desktop/tests/worker/core-host.test.ts
git commit -m "feat(desktop): add core-host worker and message router"
```

---

### Task 8: Main process — windows, tray, autostart, IPC

**Files:**
- Create: `apps/desktop/src/main/autostart.ts`, `src/main/window.ts`, `src/main/tray.ts`, `src/main/ipc.ts`, `src/main/paths.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Test: `apps/desktop/tests/main/autostart.test.ts`, `apps/desktop/tests/main/ipc.test.ts`

**Interfaces:**
- Consumes: `SecretStore`, `SettingsStore`, `AppPaths`, `HostTransport`, `DesktopApi`.
- Produces: `setAutostart(app: AutostartApp, enabled: boolean): boolean`; `createMainWindow(opts): BrowserWindow`; `createTray(opts): Tray`; `registerIpc(deps): void`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi } from 'vitest';
import { setAutostart, type AutostartApp } from '../../src/main/autostart.js';

describe('setAutostart', () => {
  it('delegates to the login item settings and returns the persisted value', () => {
    const setLoginItemSettings = vi.fn();
    const app: AutostartApp = { setLoginItemSettings, getLoginItemSettings: () => ({ openAtLogin: true }) };
    expect(setAutostart(app, true)).toBe(true);
    expect(setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true, args: ['--hidden'] });
  });
});
```

IPC test: `registerIpc` receives an `ipcMain`-shaped object and a `DesktopApi`-shaped handler map; assert each channel registers exactly one handler and that unknown invokes reject.

- [ ] **Step 2: Run tests to verify they fail** → FAIL.

- [ ] **Step 3: Implement the modules**

`autostart.ts`: `AutostartApp` minimal structural type (`setLoginItemSettings`, `getLoginItemSettings`); `setAutostart` sets `{ openAtLogin: enabled, args: ['--hidden'] }` and returns `getLoginItemSettings().openAtLogin`. `window.ts`: factory with hide-on-close (`event.preventDefault(); win.hide()`), show on `ready-to-show`, `--hidden` suppresses `show()`. `tray.ts`: `Tray` with status tooltip and menu `Открыть`, `Остановить лекцию` (disabled stub), separator, `Выход`. `ipc.ts`: `registerIpc({ ipcMain, handlers })` binds channel→handler and wraps errors. `paths.ts`: `createAppPaths(app.getPath('userData'))`.

- [ ] **Step 4: Wire `index.ts`**

Instantiate `SecretStore` with the `safeStorage` backend, `SettingsStore`, spawn `utilityProcess.fork(worker)` with a `MessageChannelMain` transport, register IPC, create window/tray, and on `before-quit` stop the host. On `setAutostart` update settings and `app.setLoginItemSettings`.

- [ ] **Step 5: Run tests to verify they pass** → `npm test -w @online-lecture/desktop -- autostart ipc` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/main apps/desktop/tests/main
git commit -m "feat(desktop): wire main process windows, tray, autostart and IPC"
```

---

### Task 9: Preload bridge and React onboarding UI

**Files:**
- Modify: `apps/desktop/src/preload/index.ts`
- Create: `apps/desktop/src/renderer/src/App.tsx` (replace placeholder), `components/CredentialsForm.tsx`, `components/SessionReady.tsx`, `components/ManualSsoPanel.tsx`, `api.ts` (replace placeholder)
- Test: `apps/desktop/tests/renderer/onboarding.test.tsx`

**Interfaces:**
- Consumes: `DesktopApi` (Task 2).
- Produces: `window.desktop: DesktopApi`; React components consuming `desktop.onboarding`.

- [ ] **Step 1: Implement the preload bridge**

`contextBridge.exposeInMainWorld('desktop', api)` where `api` calls `ipcRenderer.invoke(CHANNELS.x, payload)` for request/response and `ipcRenderer.on` for `onChanged`/`onStatusChanged`, returning an unsubscribe function. No path or secret is returned to the renderer.

- [ ] **Step 2: Write the failing renderer tests**

Add `// @vitest-environment jsdom` at the top. Mock `window.desktop`. Assert: initial `welcome` renders a start button; `credentials` renders username/password and submit calls `login({ username, password })`; `authenticating` disables the submit; `manual_sso` renders `ManualSsoPanel` and its button calls `openManualSso`; `session_ready` shows the session-active panel.

- [ ] **Step 3: Run tests to verify they fail** → FAIL.

- [ ] **Step 4: Implement `App.tsx` and components**

`App` subscribes to `onboarding.onChanged`, calls `getState()` on mount, and switches on `phase`. `CredentialsForm` is a controlled form; it clears the password field after submit and never logs it. `ManualSsoPanel` explains the visible window and rechecks session. `SessionReady` shows status and a «Проверить вход» button.

- [ ] **Step 5: Run tests to verify they pass** → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/preload apps/desktop/src/renderer apps/desktop/tests/renderer
git commit -m "feat(desktop): add preload bridge and React onboarding UI"
```

---

### Task 10: Electron E2E with a fake session provider, and docs

**Files:**
- Create: `apps/desktop/tests/e2e/onboarding.test.ts`
- Create: `apps/desktop/src/worker/session-provider.fake.ts`
- Modify: `docs/HANDOFF.md`
- Modify: `apps/desktop/README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: an env switch `ONLINE_LECTURE_FAKE_SESSION=1` that makes `core-host` use a `FakeSessionProvider` (in-memory) instead of Playwright.

- [ ] **Step 1: Implement the fake provider**

`FakeSessionProvider` implements `SessionProvider`: `loginWithCredentials` resolves `{ ok: true }` (or `{ ok:false, reason:'captcha' }` when `ONLINE_LECTURE_FAKE_SSO === 'captcha'`), writes a minimal `auth.json` fixture, `openManualLogin` resolves `{ ok: true }`, `checkSession` returns true unless `ONLINE_LECTURE_FAKE_SESSION_EXPIRED=1`.

- [ ] **Step 2: Write the E2E test as a vitest spec**

`apps/desktop/tests/e2e/onboarding.test.ts` imports `_electron` from `playwright`, calls `_electron.launch({ args: [join(repoRoot, 'apps/desktop/out/main/index.js')], env: { ...process.env, ONLINE_LECTURE_FAKE_SESSION: '1' } })`, gets `firstWindow()`, asserts the onboarding heading, clicks start, fills credentials, submits, and expects the session-active panel. Wrap the whole test in a guard: `const e2e = process.env.CI_ELECTRON_E2E === '1' ? it : it.skip;` so `npm test` stays green without a display.

- [ ] **Step 3: Run the E2E manually**

Run: `npm run build -w @online-lecture/desktop && CI_ELECTRON_E2E=1 npm test -w @online-lecture/desktop -- onboarding` → PASS (or documented skip when no display/browser).

- [ ] **Step 4: Update docs**

Update `docs/HANDOFF.md` with: slice 1 done, new `apps/desktop` package, commands (`npm run dev -w @online-lecture/desktop`), paths, and the Windows manual checklist (real SSO, DPAPI, autostart, tray). Add `apps/desktop/README.md` with the same commands.

- [ ] **Step 5: Run the full gates**

Run: `npm run build` → clean. Run: `npm test` → core + desktop pass. Run: `npx prettier --check apps/desktop` and `npx eslint apps/desktop` → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop docs/HANDOFF.md
git commit -m "test(desktop): add fake-session E2E and document slice 1"
```

---

## Self-Review Notes

- **Spec coverage:** architecture (§4) → Task 1; data paths (§5) → Task 2; onboarding/auth (§6) → Tasks 5–6; secrets (§7) → Task 3; IPC (§8) → Tasks 2, 8, 9; tray/autostart (§9) → Tasks 4, 8; testing (§10) → every task plus Task 10; acceptance (§11) → Task 10 gates.
- **Out of scope retained:** no import/schedule editing, no notifications/journal, no installer/DPAPI verification on Windows.
- **Known execution risk:** Electron download and GUI launch may be unavailable in the sandbox; E2E is explicitly skippable while pure-logic tasks stay testable.
