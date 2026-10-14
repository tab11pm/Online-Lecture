// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopApi, LoginInput } from '../../src/shared/ipc-contract.js';
import type {
  BrowserChoice,
  BrowserView,
} from '../../src/shared/browser-choice.js';
import type { OnboardingState } from '../../src/shared/onboarding.js';

const PASSWORD = 'super-secret-password';

const fake = vi.hoisted(() => {
  const listeners = new Set<(state: OnboardingState) => void>();
  const emit = (state: OnboardingState): void => {
    for (const listener of listeners) {
      listener(state);
    }
  };
  const getState = vi.fn((): Promise<OnboardingState> =>
    Promise.resolve({ phase: 'welcome' }),
  );
  const login = vi.fn((input: LoginInput): Promise<{ ok: true }> => {
    void input;
    return Promise.resolve({ ok: true });
  });
  const openManualSso = vi.fn((): Promise<{ ok: true }> =>
    Promise.resolve({ ok: true }),
  );
  const checkSession = vi.fn((): Promise<OnboardingState> =>
    Promise.resolve({ phase: 'session_ready' }),
  );
  const onChanged = vi.fn((listener: (state: OnboardingState) => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  });
  const noop = vi.fn(() => Promise.resolve());
  const browserListeners = new Set<(view: BrowserView) => void>();
  let browserView: BrowserView = {
    choice: 'edge',
    install: { status: 'missing' },
  };
  const getBrowser = vi.fn(() => Promise.resolve(browserView));
  const setBrowser = vi.fn((choice: BrowserChoice) => {
    browserView = { ...browserView, choice };
    return Promise.resolve(browserView);
  });
  const installChromium = vi.fn(() => {
    browserView = { choice: 'chromium', install: { status: 'available' } };
    return Promise.resolve(browserView);
  });
  const onBrowserChanged = vi.fn((listener: (view: BrowserView) => void) => {
    browserListeners.add(listener);
    return () => browserListeners.delete(listener);
  });
  const api: DesktopApi = {
    onboarding: { getState, login, openManualSso, checkSession, onChanged },
    app: {
      getBrowser,
      setBrowser,
      installChromium,
      onBrowserChanged,
      getInfo: vi.fn(() =>
        Promise.resolve({ version: '0.0.0', autostart: false }),
      ),
      setAutostart: vi.fn(() =>
        Promise.resolve({ version: '0.0.0', autostart: false }),
      ),
      quit: noop,
    },
    core: {
      getStatus: vi.fn(() => Promise.resolve('running' as const)),
      start: vi.fn(() => Promise.resolve('running' as const)),
      stop: vi.fn(() => Promise.resolve('stopped' as const)),
      onStatusChanged: vi.fn(() => () => undefined),
      onNotification: vi.fn(() => () => undefined),
    },
  };
  (window as unknown as { desktop: DesktopApi }).desktop = api;
  return {
    api,
    emit,
    getState,
    login,
    openManualSso,
    checkSession,
    getBrowser,
    setBrowser,
    installChromium,
    setBrowserView: (view: BrowserView) => {
      browserView = view;
    },
    emitBrowser: (view: BrowserView) => {
      browserView = view;
      for (const listener of browserListeners) listener(view);
    },
  };
});

import { App } from '../../src/renderer/src/App';

const consoleLogs: Array<{ method: string; args: unknown[] }> = [];

for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
  vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
    consoleLogs.push({ method, args });
  });
}

function consoleOutput(): string {
  return JSON.stringify(consoleLogs.map((entry) => entry.args));
}

async function readyRadio(name: string | RegExp): Promise<HTMLElement> {
  await waitFor(() =>
    expect(screen.getByRole('radio', { name })).toBeEnabled(),
  );
  return screen.getByRole('radio', { name });
}

beforeEach(() => {
  consoleLogs.length = 0;
  fake.getState.mockClear();
  fake.login.mockClear();
  fake.openManualSso.mockClear();
  fake.checkSession.mockClear();
  vi.mocked(fake.api.app.getInfo).mockClear();
  vi.mocked(fake.api.app.setAutostart).mockClear();
  fake.setBrowserView({ choice: 'edge', install: { status: 'missing' } });
  fake.getBrowser.mockClear();
  fake.setBrowser.mockClear();
  fake.installChromium.mockReset();
  fake.installChromium.mockImplementation(() =>
    Promise.resolve({ choice: 'chromium', install: { status: 'available' } }),
  );
});

afterEach(() => {
  cleanup();
});

describe('onboarding UI', () => {
  it('offers Chromium installation from the credentials screen', async () => {
    fake.getState.mockResolvedValue({ phase: 'credentials' });
    render(<App />);
    fireEvent.click(await readyRadio('Chromium'));
    expect(
      screen.getByRole('button', { name: 'Установить Chromium' }),
    ).toBeVisible();
    expect(fake.setBrowser).not.toHaveBeenCalled();
  });

  it('shows the missing-browser reason if login was attempted', async () => {
    fake.getState.mockResolvedValue({ phase: 'credentials' });
    fake.login.mockRejectedValueOnce(
      new Error('Установите Chromium в приложении.'),
    );
    render(<App />);
    fireEvent.change(await screen.findByLabelText('Логин'), {
      target: { value: 'student' },
    });
    fireEvent.change(screen.getByLabelText('Пароль'), {
      target: { value: PASSWORD },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Установите Chromium',
    );
  });

  it('selects Chromium after its installation finishes', async () => {
    fake.getState.mockResolvedValue({ phase: 'credentials' });
    render(<App />);
    fireEvent.click(await readyRadio('Chromium'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Установить Chromium' }),
    );
    await waitFor(() => expect(fake.installChromium).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByRole('radio', { name: 'Chromium' }),
    ).toBeChecked();
  });

  it('disables a second installation request while downloading', async () => {
    fake.getState.mockResolvedValue({ phase: 'credentials' });
    fake.installChromium.mockImplementationOnce(() => new Promise(() => {}));
    render(<App />);
    fireEvent.click(await readyRadio('Chromium'));
    const install = screen.getByRole('button', { name: 'Установить Chromium' });
    fireEvent.click(install);
    expect(install).toBeDisabled();
    fireEvent.click(install);
    expect(fake.installChromium).toHaveBeenCalledTimes(1);
  });

  it('offers retry after an installation error', async () => {
    fake.getState.mockResolvedValue({ phase: 'credentials' });
    fake.installChromium.mockResolvedValueOnce({
      choice: 'edge',
      install: { status: 'error', message: 'Ошибка загрузки' },
    });
    render(<App />);
    fireEvent.click(await readyRadio('Chromium'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Установить Chromium' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Повторить установку' }),
    ).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('Ошибка загрузки');
  });

  it('allows changing the browser after login', async () => {
    fake.getState.mockResolvedValue({ phase: 'session_ready' });
    fake.setBrowserView({
      choice: 'chromium',
      install: { status: 'available' },
    });
    render(<App />);
    fireEvent.click(await readyRadio(/Edge/));
    await waitFor(() => expect(fake.setBrowser).toHaveBeenCalledWith('edge'));
  });

  it('explains when an external browser setting overrides the choice', async () => {
    fake.getState.mockResolvedValue({ phase: 'credentials' });
    fake.setBrowserView({
      choice: 'edge',
      install: { status: 'missing' },
      externalChannel: '',
    });
    render(<App />);
    expect(
      await screen.findByText(/внешняя настройка браузера/i),
    ).toBeVisible();
  });
  it('renders a start button in the welcome phase', async () => {
    fake.getState.mockResolvedValue({ phase: 'welcome' });

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Начать' })).toBeVisible();
  });

  it('asks the machine to check the session when starting', async () => {
    fake.getState.mockResolvedValue({ phase: 'welcome' });
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Начать' }));

    expect(fake.checkSession).toHaveBeenCalledTimes(1);
  });

  it('renders credential fields and submits typed values, clearing the password', async () => {
    fake.getState.mockResolvedValue({ phase: 'credentials' });
    render(<App />);

    const username = await screen.findByLabelText('Логин');
    const password = screen.getByLabelText('Пароль');
    fireEvent.change(username, { target: { value: 'student' } });
    fireEvent.change(password, { target: { value: PASSWORD } });

    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

    await waitFor(() =>
      expect(fake.login).toHaveBeenCalledWith({
        username: 'student',
        password: PASSWORD,
      }),
    );
    expect(password).toHaveValue('');
    expect(consoleOutput()).not.toContain(PASSWORD);
  });

  it('keeps the submit disabled until both login and password are filled', async () => {
    fake.getState.mockResolvedValue({ phase: 'credentials' });
    render(<App />);

    const username = await screen.findByLabelText('Логин');
    const password = screen.getByLabelText('Пароль');
    const submit = screen.getByRole('button', { name: 'Войти' });
    expect(submit).toBeDisabled();

    fireEvent.change(username, { target: { value: '   ' } });
    fireEvent.change(password, { target: { value: PASSWORD } });
    expect(submit).toBeDisabled();

    fireEvent.change(username, { target: { value: 'student' } });
    fireEvent.change(password, { target: { value: '' } });
    expect(submit).toBeDisabled();

    fireEvent.submit(submit.closest('form') as HTMLFormElement);
    expect(fake.login).not.toHaveBeenCalled();
  });

  it('submits the login without surrounding whitespace', async () => {
    fake.getState.mockResolvedValue({ phase: 'credentials' });
    render(<App />);

    fireEvent.change(await screen.findByLabelText('Логин'), {
      target: { value: '  student  ' },
    });
    fireEvent.change(screen.getByLabelText('Пароль'), {
      target: { value: PASSWORD },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

    await waitFor(() =>
      expect(fake.login).toHaveBeenCalledWith({
        username: 'student',
        password: PASSWORD,
      }),
    );
  });

  it('disables the submit while authenticating', async () => {
    fake.getState.mockResolvedValue({ phase: 'authenticating' });
    render(<App />);

    const submit = await screen.findByRole('button', { name: 'Войти' });

    expect(submit).toBeDisabled();
  });

  it('renders the manual SSO panel and opens the TUSUR window', async () => {
    fake.getState.mockResolvedValue({ phase: 'manual_sso' });
    render(<App />);

    expect(await screen.findByText(/окно входа тусур/i)).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: /открыть окно входа/i }),
    );

    expect(fake.openManualSso).toHaveBeenCalledTimes(1);
  });

  it('shows the active session panel and rechecks the session', async () => {
    fake.getState.mockResolvedValue({ phase: 'session_ready' });
    render(<App />);

    expect(await screen.findByText(/сессия активна/i)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Проверить вход' }));

    expect(fake.checkSession).toHaveBeenCalledTimes(1);
  });

  it('toggles autostart through the app bridge', async () => {
    fake.getState.mockResolvedValue({ phase: 'session_ready' });
    render(<App />);

    const toggle = await screen.findByRole('checkbox', {
      name: /запускать при старте/i,
    });
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);

    await waitFor(() =>
      expect(fake.api.app.setAutostart).toHaveBeenCalledWith(true),
    );
  });

  it('reacts to onboarding state changes from the bridge', async () => {
    fake.getState.mockResolvedValue({ phase: 'welcome' });
    render(<App />);
    await screen.findByRole('button', { name: 'Начать' });

    act(() => {
      fake.emit({ phase: 'credentials' });
    });

    expect(await screen.findByLabelText('Логин')).toBeVisible();
  });
});
