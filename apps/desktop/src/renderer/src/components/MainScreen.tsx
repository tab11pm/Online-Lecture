import { useEffect, useState } from 'react';
import { History, Plus } from 'lucide-react';
import type { AgendaItem, LecturesView } from '../../../shared/lectures.js';
import { desktop } from '../api';
import { AgendaList } from './AgendaList';
import { ChromiumBanner } from './ChromiumBanner';
import { ImportPanel } from './ImportPanel';
import { LectureStatus } from './LectureStatus';
import { ManualLectureWizard } from './ManualLectureWizard';
import { ScheduleEditor } from './ScheduleEditor';
import { SettingsPanel } from './SettingsPanel';

export interface MainScreenProps {
  onCheckSession(): void;
  onOpenJournal(): void;
}

function message(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Не удалось выполнить действие.';
}

function todayLabel(): string {
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
}

export function MainScreen({ onCheckSession, onOpenJournal }: MainScreenProps) {
  const [view, setView] = useState<LecturesView>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [showWizard, setShowWizard] = useState(false);
  const [editing, setEditing] = useState<AgendaItem>();
  const [editingMode, setEditingMode] = useState<'time' | 'move'>('time');

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

  function confirmDelete(item: AgendaItem): void {
    const action = item.source === 'manual' ? 'удалить' : 'скрыть';
    if (!window.confirm(`Точно ${action} пару «${item.title}»?`)) return;
    run(
      desktop.lectures.deleteLecture(
        item.jobId,
        item.source === 'timetable' ? item.occurrenceId : undefined,
      ),
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="page-head__date">{todayLabel()}</p>
          <h1>Online Lecture</h1>
          <p className="page-head__sub">
            Ближайшие пары и состояние подключения. Всё хранится локально.
          </p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onOpenJournal}
          >
            <History size={15} strokeWidth={1.8} aria-hidden="true" />
            Журнал
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setShowWizard(true);
              setEditing(undefined);
            }}
          >
            <Plus size={16} strokeWidth={2} aria-hidden="true" />
            Добавить пару
          </button>
        </div>
      </div>

      {notice ? (
        <p role="alert" className="alert">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="alert alert--error">
          {error}
        </p>
      ) : null}

      {view ? (
        <div className="workspace">
          <div className="column">
            <LectureStatus
              view={view}
              onStop={() => run(desktop.lectures.stopCurrent())}
            />
            <AgendaList
              agenda={view.agenda}
              onEdit={(item, mode = 'time') => {
                setEditing(item);
                setEditingMode(mode);
                setShowWizard(false);
              }}
              onDelete={confirmDelete}
              onCancelReschedule={(item) =>
                run(desktop.lectures.cancelReschedule(item.jobId))
              }
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
          </div>
          <aside className="column">
            <ImportPanel
              view={view.import}
              onImport={() => run(desktop.lectures.importNow())}
            />
            <ChromiumBanner />
            <SettingsPanel onCheckSession={onCheckSession} />
          </aside>
        </div>
      ) : (
        <p role="status" className="empty">
          Загрузка…
        </p>
      )}

      {showWizard ? (
        <ManualLectureWizard
          onClose={() => setShowWizard(false)}
          onAuthRequired={onCheckSession}
        />
      ) : null}
      {editing ? (
        <ScheduleEditor
          item={editing}
          initialMode={editingMode}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
    </div>
  );
}
