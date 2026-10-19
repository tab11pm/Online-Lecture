import { useState } from 'react';
import type { FormEvent } from 'react';
import { CalendarDays, Clock3, Save, X } from 'lucide-react';
import type { AgendaItem } from '../../../shared/lectures.js';
import { desktop } from '../api';

export function ScheduleEditor({
  item,
  initialMode = 'time',
  onClose,
}: {
  item: AgendaItem;
  initialMode?: 'time' | 'move';
  onClose(): void;
}) {
  const [mode, setMode] = useState<'time' | 'move'>(initialMode);
  const [date, setDate] = useState(item.date);
  const [joinAt, setJoinAt] = useState(item.joinAt);
  const [leaveAt, setLeaveAt] = useState(item.leaveAt);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(undefined);
    if (!date || !joinAt || !leaveAt || leaveAt <= joinAt) {
      setError('Время выхода должно быть позже времени входа.');
      return;
    }
    setPending(true);
    try {
      if (mode === 'time')
        await desktop.lectures.editImportedTime({
          jobId: item.jobId,
          date: item.date,
          occurrenceId: item.occurrenceId,
          joinAt,
          leaveAt,
        });
      else
        await desktop.lectures.reschedule({
          jobId: item.jobId,
          date: item.date,
          occurrenceId: item.occurrenceId,
          newDate: date,
          newJoinAt: joinAt,
          newLeaveAt: leaveAt,
        });
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Не удалось сохранить пару.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="modal" aria-label={`Изменить ${item.title}`}>
      <div className="modal__panel">
        <header className="modal__head">
          <div>
            <p className="eyebrow">Расписание</p>
            <h3>{item.title}</h3>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Закрыть"
            onClick={onClose}
            disabled={pending}
          >
            <X size={17} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </header>
        <p className="modal__meta">
          Исходная пара: {item.date}, {item.joinAt}–{item.leaveAt}
        </p>
        <div className="segmented modal__tabs">
          <button
            type="button"
            aria-pressed={mode === 'time'}
            onClick={() => {
              setMode('time');
              setDate(item.date);
              setError(undefined);
            }}
          >
            <Clock3 size={12} strokeWidth={1.8} aria-hidden="true" />
            Изменить время
          </button>
          <button
            type="button"
            aria-pressed={mode === 'move'}
            onClick={() => {
              setMode('move');
              setError(undefined);
            }}
          >
            <CalendarDays size={12} strokeWidth={1.8} aria-hidden="true" />
            Перенести на другую дату
          </button>
        </div>
        <form className="form" onSubmit={(event) => void submit(event)}>
          {mode === 'move' ? (
            <div className="field">
              <label htmlFor="new-date">Новая дата</label>
              <input
                id="new-date"
                className="input"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </div>
          ) : null}
          <p className="fineprint">
            Часовой пояс: Красноярск (Asia/Krasnoyarsk)
          </p>
          <div className="field-row">
            <div className="field">
              <label htmlFor="edit-join">Вход</label>
              <input
                id="edit-join"
                className="input"
                type="time"
                value={joinAt}
                onChange={(event) => setJoinAt(event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="edit-leave">Выход</label>
              <input
                id="edit-leave"
                className="input"
                type="time"
                value={leaveAt}
                onChange={(event) => setLeaveAt(event.target.value)}
                required
                aria-invalid={Boolean(error)}
              />
            </div>
          </div>
          {error ? (
            <p role="alert" className="alert alert--error">
              {error}
            </p>
          ) : null}
          <div className="modal__actions">
            <button
              type="submit"
              className="btn btn--primary"
              disabled={pending}
            >
              <Save size={15} strokeWidth={1.8} aria-hidden="true" />
              {pending
                ? 'Сохранение…'
                : mode === 'time'
                  ? 'Сохранить время'
                  : 'Сохранить перенос'}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onClose}
              disabled={pending}
            >
              <X size={15} strokeWidth={1.8} aria-hidden="true" />
              Отмена
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
