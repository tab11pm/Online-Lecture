import { useEffect, useState } from 'react';
import type { AgendaItem, LecturesView } from '../../../shared/lectures.js';
import { desktop } from '../api';
import { AgendaList } from './AgendaList';
import { ChromiumBanner } from './ChromiumBanner';
import { ImportPanel } from './ImportPanel';
import { LectureStatus } from './LectureStatus';
import { SettingsPanel } from './SettingsPanel';

export interface MainScreenProps {
  onCheckSession(): void;
}

function message(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Не удалось выполнить действие.';
}

export function MainScreen({ onCheckSession }: MainScreenProps) {
  const [view, setView] = useState<LecturesView>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  useEffect(
    () =>
      desktop.core.onNotification((notification) => {
        setNotice(notification.message);
      }),
    [],
  );

  useEffect(() => {
    let active = true;
    const unsubscribe = desktop.lectures.onChanged((next) => {
      if (active) setView(next);
    });
    void desktop.lectures.getView().then(
      (next) => {
        if (active) setView(next);
      },
      (reason: unknown) => {
        if (active) setError(message(reason));
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  function run(action: Promise<void>): void {
    setError(undefined);
    action.catch((reason: unknown) => setError(message(reason)));
  }

  return (
    <main>
      <h1>Online Lecture</h1>
      {notice ? <p role="alert">{notice}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {view ? (
        <>
          <LectureStatus
            view={view}
            onStop={() => run(desktop.lectures.stopCurrent())}
          />
          <ImportPanel
            view={view.import}
            onImport={() => run(desktop.lectures.importNow())}
          />
          <AgendaList
            agenda={view.agenda}
            onSetSkipped={(item: AgendaItem, skipped: boolean) =>
              run(
                desktop.lectures.setSkipped(
                  item.jobId,
                  item.occurrenceId,
                  skipped,
                ),
              )
            }
          />
        </>
      ) : (
        <p role="status">Загрузка…</p>
      )}
      <ChromiumBanner />
      <SettingsPanel onCheckSession={onCheckSession} />
    </main>
  );
}
