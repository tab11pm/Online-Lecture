import { useState } from 'react';
import type { AgendaItem } from '../../../shared/lectures.js';
import { desktop } from '../api';

export function ScheduleEditor({
  item,
  onClose,
}: {
  item: AgendaItem;
  onClose(): void;
}) {
  const [mode, setMode] = useState<'time' | 'move'>('time');
  const [date, setDate] = useState(item.date);
  const [joinAt, setJoinAt] = useState(item.joinAt);
  const [leaveAt, setLeaveAt] = useState(item.leaveAt);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
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
          joinAt,
          leaveAt,
        });
      else
        await desktop.lectures.reschedule({
          jobId: item.jobId,
          date: item.date,
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
    <section className="schedule-editor" aria-label={`Изменить ${item.title}`}>
      <h3>{item.title}</h3>
      <p>
        Исходная пара: {item.date}, {item.joinAt}–{item.leaveAt}
      </p>
      <div className="schedule-editor__tabs">
        <button
          type="button"
          aria-pressed={mode === 'time'}
          onClick={() => {
            setMode('time');
            setDate(item.date);
            setError(undefined);
          }}
        >
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
          Перенести на другую дату
        </button>
      </div>
      <form onSubmit={(event) => void submit(event)}>
        {mode === 'move' ? (
          <label>
            Новая дата{' '}
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
            />
          </label>
        ) : null}
        <p>Часовой пояс: Красноярск (Asia/Krasnoyarsk)</p>
        <label>
          Вход{' '}
          <input
            type="time"
            value={joinAt}
            onChange={(event) => setJoinAt(event.target.value)}
            required
          />
        </label>
        <label>
          Выход{' '}
          <input
            type="time"
            value={leaveAt}
            onChange={(event) => setLeaveAt(event.target.value)}
            required
            aria-invalid={Boolean(error)}
          />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <div className="schedule-editor__actions">
          <button type="submit" disabled={pending}>
            {pending
              ? 'Сохранение…'
              : mode === 'time'
                ? 'Сохранить время'
                : 'Сохранить перенос'}
          </button>
          <button type="button" onClick={onClose} disabled={pending}>
            Отмена
          </button>
        </div>
      </form>
    </section>
  );
}
