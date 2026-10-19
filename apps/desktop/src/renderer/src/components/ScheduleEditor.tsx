import { useState } from 'react';
import type { FormEvent } from 'react';
import { CalendarDays, Clock3, Save, X } from 'lucide-react';
import type { AgendaItem } from '../../../shared/lectures.js';
import { desktop } from '../api';
import {
  isValidClockTime,
  normalizeClockTime,
  toDisplayDate,
  toIsoDate,
} from '../date-time-input';
import { Modal } from './Modal';

export function ScheduleEditor({
  item,
  initialMode = 'time',
  onClose,
  active = true,
}: {
  item: AgendaItem;
  initialMode?: 'time' | 'move';
  onClose(): void;
  active?: boolean;
}) {
  const [mode, setMode] = useState<'time' | 'move'>(initialMode);
  const [date, setDate] = useState(toDisplayDate(item.date));
  const [joinAt, setJoinAt] = useState(item.joinAt);
  const [leaveAt, setLeaveAt] = useState(item.leaveAt);
  const [error, setError] = useState<string>();
  const [errorField, setErrorField] = useState<'date' | 'joinAt' | 'leaveAt'>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(undefined);
    setErrorField(undefined);
    const isoDate = toIsoDate(date);
    const normalizedJoin = normalizeClockTime(joinAt);
    const normalizedLeave = normalizeClockTime(leaveAt);
    if (
      (mode === 'move' && !isoDate) ||
      !isValidClockTime(normalizedJoin) ||
      !isValidClockTime(normalizedLeave) ||
      normalizedLeave <= normalizedJoin
    ) {
      const invalidField =
        mode === 'move' && !isoDate
          ? 'date'
          : !isValidClockTime(normalizedJoin)
            ? 'joinAt'
            : 'leaveAt';
      setErrorField(invalidField);
      setError(
        mode === 'move' && !isoDate
          ? 'Введите существующую дату в формате ДД.ММ.ГГГГ.'
          : !isValidClockTime(normalizedJoin) ||
              !isValidClockTime(normalizedLeave)
            ? 'Введите время в формате ЧЧ:ММ (00:00–23:59).'
            : 'Время выхода должно быть позже времени входа.',
      );
      const targetId =
        invalidField === 'date'
          ? 'new-date'
          : invalidField === 'joinAt'
            ? 'edit-join'
            : 'edit-leave';
      window.setTimeout(() => document.getElementById(targetId)?.focus(), 0);
      return;
    }
    setPending(true);
    try {
      if (mode === 'time')
        await desktop.lectures.editImportedTime({
          jobId: item.jobId,
          date: item.date,
          occurrenceId: item.occurrenceId,
          joinAt: normalizedJoin,
          leaveAt: normalizedLeave,
        });
      else
        await desktop.lectures.reschedule({
          jobId: item.jobId,
          date: item.date,
          occurrenceId: item.occurrenceId,
          newDate: isoDate!,
          newJoinAt: normalizedJoin,
          newLeaveAt: normalizedLeave,
        });
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Не удалось сохранить пару.',
      );
      setErrorField(undefined);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      titleId="schedule-editor-title"
      onClose={onClose}
      busy={pending}
      active={active}
    >
      <header className="modal__head">
        <div>
          <p className="eyebrow">Расписание</p>
          <h2 id="schedule-editor-title">{item.title}</h2>
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
        Исходная пара: {toDisplayDate(item.date)}, {item.joinAt}–{item.leaveAt}
      </p>
      <div className="segmented modal__tabs">
        <button
          type="button"
          aria-pressed={mode === 'time'}
          onClick={() => {
            setMode('time');
            setDate(toDisplayDate(item.date));
            setError(undefined);
            setErrorField(undefined);
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
            setErrorField(undefined);
          }}
        >
          <CalendarDays size={12} strokeWidth={1.8} aria-hidden="true" />
          Перенести на другую дату
        </button>
      </div>
      <form
        id="schedule-editor-form"
        className="modal__scroll form"
        onSubmit={(event) => void submit(event)}
      >
        {mode === 'move' ? (
          <div className="field">
            <label htmlFor="new-date">Новая дата</label>
            <span id="new-date-hint" className="field-hint">
              ДД.ММ.ГГГГ
            </span>
            <input
              id="new-date"
              className="input"
              type="text"
              inputMode="numeric"
              placeholder="ДД.ММ.ГГГГ"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              aria-invalid={errorField === 'date'}
              aria-describedby={
                errorField === 'date' ? 'new-date-error' : 'new-date-hint'
              }
            />
            {errorField === 'date' ? (
              <p id="new-date-error" className="field-error">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
        <p className="fineprint">Часовой пояс: Красноярск (Asia/Krasnoyarsk)</p>
        <div className="field-row">
          <div className="field">
            <label htmlFor="edit-join">Вход</label>
            <span id="edit-join-hint" className="field-hint">
              ЧЧ:ММ
            </span>
            <input
              id="edit-join"
              className="input"
              type="text"
              inputMode="numeric"
              placeholder="09:00"
              value={joinAt}
              onChange={(event) => setJoinAt(event.target.value)}
              aria-invalid={errorField === 'joinAt'}
              aria-describedby={
                errorField === 'joinAt' ? 'edit-join-error' : 'edit-join-hint'
              }
            />
            {errorField === 'joinAt' ? (
              <p id="edit-join-error" className="field-error">
                {error}
              </p>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="edit-leave">Выход</label>
            <span id="edit-leave-hint" className="field-hint">
              ЧЧ:ММ
            </span>
            <input
              id="edit-leave"
              className="input"
              type="text"
              inputMode="numeric"
              placeholder="10:30"
              value={leaveAt}
              onChange={(event) => setLeaveAt(event.target.value)}
              aria-invalid={errorField === 'leaveAt'}
              aria-describedby={
                errorField === 'leaveAt'
                  ? 'edit-leave-error'
                  : 'edit-leave-hint'
              }
            />
            {errorField === 'leaveAt' ? (
              <p id="edit-leave-error" className="field-error">
                {error}
              </p>
            ) : null}
          </div>
        </div>
        {error && !errorField ? (
          <p role="alert" className="alert alert--error">
            {error}
          </p>
        ) : null}
      </form>
      <footer className="modal__actions">
        <button
          type="submit"
          form="schedule-editor-form"
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
      </footer>
    </Modal>
  );
}
