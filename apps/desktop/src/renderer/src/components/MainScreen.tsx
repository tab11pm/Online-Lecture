import { useEffect, useRef, useState } from 'react';
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
import { Modal } from './Modal';
import { Trash2, X } from 'lucide-react';
import { toDisplayDate } from '../date-time-input';

export interface MainScreenProps {
  onCheckSession(): void;
  onOpenJournal(): void;
  active?: boolean;
  checkingSession?: boolean;
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

export function MainScreen({
  onCheckSession,
  onOpenJournal,
  active = true,
  checkingSession = false,
}: MainScreenProps) {
  const addPairButtonRef = useRef<HTMLButtonElement>(null);
  const [view, setView] = useState<LecturesView>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [showWizard, setShowWizard] = useState(false);
  const [editing, setEditing] = useState<AgendaItem>();
  const [editingMode, setEditingMode] = useState<'time' | 'move'>('time');
  const [confirmingDelete, setConfirmingDelete] = useState<AgendaItem>();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();

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
    setDeleteError(undefined);
    setConfirmingDelete(item);
  }

  async function deleteConfirmed(): Promise<void> {
    if (!confirmingDelete || deleting) return;
    setDeleting(true);
    setDeleteError(undefined);
    try {
      await desktop.lectures.deleteLecture(
        confirmingDelete.jobId,
        confirmingDelete.source === 'timetable'
          ? confirmingDelete.occurrenceId
          : undefined,
      );
      setConfirmingDelete(undefined);
    } catch (reason) {
      setDeleteError(message(reason));
    } finally {
      setDeleting(false);
    }
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
            ref={addPairButtonRef}
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
              onImport={() => desktop.lectures.importNow()}
            />
            <ChromiumBanner />
            <SettingsPanel
              onCheckSession={onCheckSession}
              checkingSession={checkingSession}
            />
          </aside>
        </div>
      ) : (
        <p role="status" className="empty">
          Загрузка…
        </p>
      )}

      {showWizard ? (
        <ManualLectureWizard
          active={active}
          onClose={() => setShowWizard(false)}
          onAuthRequired={onCheckSession}
        />
      ) : null}
      {editing ? (
        <ScheduleEditor
          active={active}
          item={editing}
          initialMode={editingMode}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
      {confirmingDelete ? (
        <Modal
          titleId="delete-confirmation-title"
          onClose={() => setConfirmingDelete(undefined)}
          busy={deleting}
          active={active}
          fallbackFocus={() => addPairButtonRef.current}
        >
          <header className="modal__head">
            <div>
              <p className="eyebrow">Подтвердите действие</p>
              <h2 id="delete-confirmation-title">
                {confirmingDelete.source === 'manual'
                  ? 'Удалить пару?'
                  : 'Скрыть пару?'}
              </h2>
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label="Закрыть"
              onClick={() => setConfirmingDelete(undefined)}
              disabled={deleting}
            >
              <X size={17} aria-hidden="true" />
            </button>
          </header>
          <div className="modal__scroll confirmation-copy">
            <p className="confirmation-copy__title">{confirmingDelete.title}</p>
            <p>
              {toDisplayDate(confirmingDelete.date)} · {confirmingDelete.joinAt}
              –{confirmingDelete.leaveAt}
            </p>
            <p>
              {confirmingDelete.source === 'manual'
                ? 'Вся ручная запись будет удалена: все повторы исчезнут из расписания. История запусков останется.'
                : 'Эта пара будет скрыта в вашем расписании. Другие занятия останутся без изменений.'}
            </p>
          </div>
          {deleteError ? (
            <p role="alert" className="field-error">
              Не удалось выполнить действие: {deleteError}
            </p>
          ) : null}
          <footer className="modal__actions">
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => void deleteConfirmed()}
              disabled={deleting}
            >
              <Trash2 size={15} aria-hidden="true" />
              {deleting
                ? 'Выполняется…'
                : confirmingDelete.source === 'manual'
                  ? 'Удалить пару'
                  : 'Скрыть пару'}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setConfirmingDelete(undefined)}
              disabled={deleting}
            >
              <X size={15} aria-hidden="true" />
              Отмена
            </button>
          </footer>
        </Modal>
      ) : null}
    </div>
  );
}
