import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight, LoaderCircle, RotateCcw } from 'lucide-react';
import type { LoginInput } from '../../shared/ipc-contract.js';
import type { OnboardingState } from '../../shared/onboarding.js';
import { desktop } from './api';
import { CredentialsForm } from './components/CredentialsForm';
import { BrowserChoice } from './components/BrowserChoice';
import { ManualSsoPanel } from './components/ManualSsoPanel';
import { MainScreen } from './components/MainScreen';
import { JournalScreen } from './components/JournalScreen';
import { TopBar } from './components/TopBar';

function ScheduleArt() {
  return (
    <div className="schedule-art" aria-hidden="true">
      <div className="schedule-art__row schedule-art__row--now">
        <span className="schedule-art__time">10:00</span>
        <span className="schedule-art__name">Математический анализ</span>
        <span className="schedule-art__tag">сейчас</span>
      </div>
      <div className="schedule-art__row">
        <span className="schedule-art__time">12:15</span>
        <span className="schedule-art__name">Физика</span>
      </div>
      <div className="schedule-art__row">
        <span className="schedule-art__time">14:00</span>
        <span className="schedule-art__name">История</span>
      </div>
    </div>
  );
}

function OnboardingFrame({
  headline,
  lead,
  children,
}: {
  headline: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <main className="onboarding">
      <section className="onboarding__copy">
        <p className="eyebrow">Онлайн-пары ТУСУР</p>
        <h1 className="display">{headline}</h1>
        <p className="onboarding__lead">{lead}</p>
        <ScheduleArt />
      </section>
      <section className="onboarding__panel">{children}</section>
    </main>
  );
}

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
    return (
      <div className="app-shell">
        <TopBar sessionReady={false} />
        <JournalScreen onBack={() => setJournalOpen(false)} />
      </div>
    );
  }

  if (state.phase === 'session_ready') {
    return (
      <div className="app-shell">
        <TopBar sessionReady />
        {actionError ? (
          <p role="alert" className="alert alert--error">
            {actionError}
          </p>
        ) : null}
        <div hidden={journalOpen}>
          <MainScreen
            onCheckSession={handleCheckSession}
            onOpenJournal={() => setJournalOpen(true)}
          />
        </div>
        {journalOpen ? (
          <JournalScreen onBack={() => setJournalOpen(false)} />
        ) : null}
      </div>
    );
  }

  switch (state.phase) {
    case 'welcome':
      return (
        <div className="app-shell">
          <TopBar sessionReady={false} />
          <OnboardingFrame
            headline="Расписание приходит само."
            lead="Online Lecture подключается к онлайн-парам ТУСУР по расписанию, слушает и выходит без вашего участия."
          >
            <div className="panel">
              <p className="panel__eyebrow">Добро пожаловать</p>
              <h2 className="panel__title">Online Lecture</h2>
              <p className="panel__lede">Подключение к онлайн-лекциям ТУСУР.</p>
              {actionError ? (
                <p role="alert" className="alert alert--error">
                  {actionError}
                </p>
              ) : null}
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleCheckSession}
                >
                  Начать
                  <ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" />
                </button>
              </div>
              <BrowserChoice />
            </div>
          </OnboardingFrame>
        </div>
      );
    case 'credentials':
      return (
        <div className="app-shell">
          <TopBar sessionReady={false} />
          <OnboardingFrame
            headline="Один вход — и пара уже идёт."
            lead="Используйте свою учётную запись ТУСУР. Пароль шифруется и остаётся на этом компьютере."
          >
            <CredentialsForm
              error={actionError ?? state.error}
              onSubmit={handleLogin}
            />
            <BrowserChoice />
          </OnboardingFrame>
        </div>
      );
    case 'authenticating':
      return (
        <div className="app-shell">
          <TopBar sessionReady={false} />
          <OnboardingFrame
            headline="Проверяем доступ."
            lead="Открываем защищённую сессию ТУСУР. Это займёт несколько секунд."
          >
            <div className="panel">
              <p className="panel__eyebrow">Вход</p>
              <h2 className="panel__title">Вход в ТУСУР</h2>
              <p role="status" className="panel__lede">
                Выполняется вход…
              </p>
              <div className="progress-line" aria-hidden="true" />
              <div className="form-actions">
                <button type="button" className="btn btn--primary" disabled>
                  <LoaderCircle
                    className="spin"
                    size={15}
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                  Войти
                </button>
              </div>
            </div>
          </OnboardingFrame>
        </div>
      );
    case 'manual_sso':
      return (
        <div className="app-shell">
          <TopBar sessionReady={false} />
          <OnboardingFrame
            headline="Подтвердите вход в браузере."
            lead="ТУСУР попросит пройти проверку в отдельном окне. После этого вернитесь сюда."
          >
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
            {actionError ? (
              <p role="alert" className="alert alert--error">
                {actionError}
              </p>
            ) : null}
            <BrowserChoice />
          </OnboardingFrame>
        </div>
      );
    case 'failed':
      return (
        <div className="app-shell">
          <TopBar sessionReady={false} />
          <OnboardingFrame
            headline="Вход не завершился."
            lead="Проверьте логин и пароль или повторите попытку. Сессия не была сохранена."
          >
            <div className="panel">
              <p className="panel__eyebrow">Ошибка входа</p>
              <h2 className="panel__title">Не удалось войти</h2>
              <p role="alert" className="alert alert--error">
                {actionError ?? state.message}
              </p>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleCheckSession}
                >
                  <RotateCcw size={15} strokeWidth={1.8} aria-hidden="true" />
                  Повторить
                </button>
              </div>
              <BrowserChoice />
            </div>
          </OnboardingFrame>
        </div>
      );
  }
}
