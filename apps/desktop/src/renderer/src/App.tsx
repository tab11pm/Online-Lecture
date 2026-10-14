import { useEffect, useState } from 'react';
import type { LoginInput } from '../../shared/ipc-contract.js';
import type { OnboardingState } from '../../shared/onboarding.js';
import { desktop } from './api';
import { CredentialsForm } from './components/CredentialsForm';
import { ManualSsoPanel } from './components/ManualSsoPanel';
import { SessionReady } from './components/SessionReady';

export function App() {
  const [state, setState] = useState<OnboardingState>({ phase: 'welcome' });

  useEffect(() => {
    let active = true;
    const unsubscribe = desktop.onboarding.onChanged((next) => {
      if (active) {
        setState(next);
      }
    });
    void desktop.onboarding
      .getState()
      .then((next) => {
        if (active) {
          setState(next);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  function handleLogin(input: LoginInput): void {
    void desktop.onboarding.login(input);
  }

  // checkSession already degrades to the login form on failure; swallow any
  // transport-level rejection (worker restart, timeout) so it never surfaces as
  // an unhandled promise rejection.
  function handleCheckSession(): void {
    void desktop.onboarding.checkSession().catch(() => undefined);
  }

  switch (state.phase) {
    case 'welcome':
      return (
        <main>
          <h1>Online Lecture</h1>
          <p>Подключение к онлайн-лекциям ТУСУР.</p>
          <button type="button" onClick={handleCheckSession}>
            Начать
          </button>
        </main>
      );
    case 'credentials':
      return <CredentialsForm error={state.error} onSubmit={handleLogin} />;
    case 'authenticating':
      return (
        <main>
          <h1>Вход в ТУСУР</h1>
          <p role="status">Выполняется вход…</p>
          <button type="button" disabled>
            Войти
          </button>
        </main>
      );
    case 'manual_sso':
      return (
        <ManualSsoPanel
          onOpen={() => void desktop.onboarding.openManualSso()}
        />
      );
    case 'session_ready':
      return <SessionReady onCheck={handleCheckSession} />;
    case 'failed':
      return (
        <main>
          <h1>Не удалось войти</h1>
          <p role="alert">{state.message}</p>
          <button type="button" onClick={handleCheckSession}>
            Повторить
          </button>
        </main>
      );
  }
}
