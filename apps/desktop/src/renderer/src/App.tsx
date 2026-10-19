import { useEffect, useState } from 'react';
import type { LoginInput } from '../../shared/ipc-contract.js';
import type { OnboardingState } from '../../shared/onboarding.js';
import { desktop } from './api';
import { CredentialsForm } from './components/CredentialsForm';
import { BrowserChoice } from './components/BrowserChoice';
import { ManualSsoPanel } from './components/ManualSsoPanel';
import { MainScreen } from './components/MainScreen';
import { JournalScreen } from './components/JournalScreen';

export function App() {
  const [state, setState] = useState<OnboardingState>({ phase: 'welcome' });
  const [actionError, setActionError] = useState<string>();
  const [journalOpen, setJournalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const unsubscribe = desktop.journal.onOpen(() => {
      setJournalOpen(true);
      void desktop.journal.consumeOpenRequest().catch(() => undefined);
    });
    void desktop.journal
      .consumeOpenRequest()
      .then((pending) => {
        if (active && pending) setJournalOpen(true);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

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
    setActionError(undefined);
    void desktop.onboarding.login(input).catch((error: unknown) => {
      setActionError(
        error instanceof Error ? error.message : 'Не удалось войти.',
      );
    });
  }

  // checkSession already degrades to the login form on failure; swallow any
  // transport-level rejection (worker restart, timeout) so it never surfaces as
  // an unhandled promise rejection.
  function handleCheckSession(): void {
    setActionError(undefined);
    void desktop.onboarding.checkSession().catch((error: unknown) => {
      setActionError(
        error instanceof Error ? error.message : 'Не удалось проверить вход.',
      );
    });
  }

  if (journalOpen && state.phase !== 'session_ready') {
    return <JournalScreen onBack={() => setJournalOpen(false)} />;
  }

  switch (state.phase) {
    case 'welcome':
      return (
        <main>
          <h1>Online Lecture</h1>
          <p>Подключение к онлайн-лекциям ТУСУР.</p>
          {actionError ? <p role="alert">{actionError}</p> : null}
          <button type="button" onClick={handleCheckSession}>
            Начать
          </button>
          <BrowserChoice />
        </main>
      );
    case 'credentials':
      return (
        <>
          <CredentialsForm
            error={actionError ?? state.error}
            onSubmit={handleLogin}
          />
          <BrowserChoice />
        </>
      );
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
        <>
          <ManualSsoPanel
            onOpen={() => {
              void desktop.onboarding
                .openManualSso()
                .catch((error: unknown) =>
                  setActionError(
                    error instanceof Error
                      ? error.message
                      : 'Не удалось открыть вход.',
                  ),
                );
            }}
          />
          {actionError ? <p role="alert">{actionError}</p> : null}
          <BrowserChoice />
        </>
      );
    case 'session_ready':
      return (
        <>
          {actionError ? <p role="alert">{actionError}</p> : null}
          <div hidden={journalOpen}>
            <MainScreen
              onCheckSession={handleCheckSession}
              onOpenJournal={() => setJournalOpen(true)}
            />
          </div>
          {journalOpen ? (
            <JournalScreen onBack={() => setJournalOpen(false)} />
          ) : null}
        </>
      );
    case 'failed':
      return (
        <main>
          <h1>Не удалось войти</h1>
          <p role="alert">{actionError ?? state.message}</p>
          <button type="button" onClick={handleCheckSession}>
            Повторить
          </button>
          <BrowserChoice />
        </main>
      );
  }
}
