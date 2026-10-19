import { useState } from 'react';
import type { FormEvent } from 'react';
import { BookOpen, Save, Search, Video, X } from 'lucide-react';
import type { ManualTargetLookup } from '../../../shared/lectures.js';
import type { Weekday } from '@core/core/types.js';
import { desktop } from '../api';

const weekdays: Array<[Weekday, string]> = [
  ['mon', 'Пн'],
  ['tue', 'Вт'],
  ['wed', 'Ср'],
  ['thu', 'Чт'],
  ['fri', 'Пт'],
  ['sat', 'Сб'],
  ['sun', 'Вс'],
];

export function ManualLectureWizard({
  onClose,
  onAuthRequired,
}: {
  onClose(): void;
  onAuthRequired?(): void;
}) {
  const [query, setQuery] = useState('');
  const [lookup, setLookup] = useState<ManualTargetLookup>();
  const [candidateId, setCandidateId] = useState('');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<'once' | 'weekly'>('once');
  const [date, setDate] = useState('');
  const [days, setDays] = useState<Weekday[]>([]);
  const [joinAt, setJoinAt] = useState('');
  const [leaveAt, setLeaveAt] = useState('');
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim() || searching) return;
    setError(undefined);
    setCandidateId('');
    setLookup(undefined);
    setSearching(true);
    try {
      const result = await desktop.lectures.resolveManualTarget(query.trim());
      setLookup(result);
      if (result.status === 'resolved' && result.candidates[0])
        setTitle(result.candidates[0].name);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Не удалось найти активность.',
      );
    } finally {
      setSearching(false);
    }
  }

  function toggleDay(day: Weekday) {
    setDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day],
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError(undefined);
    if (kind === 'weekly' && days.length === 0) {
      setError('Выберите хотя бы один день недели.');
      return;
    }
    if (!candidateId) {
      setError('Выберите подтверждённую BBB-активность.');
      return;
    }
    if (!title.trim() || !joinAt || !leaveAt || (kind === 'once' && !date)) {
      setError('Заполните название, дату и время пары.');
      return;
    }
    if (leaveAt <= joinAt) {
      setError('Время выхода должно быть позже времени входа.');
      return;
    }
    setSaving(true);
    try {
      await desktop.lectures.saveManual({
        candidateId,
        title: title.trim(),
        schedule:
          kind === 'once'
            ? { type: 'once', date, joinAt, leaveAt }
            : { type: 'weekly', days, joinAt, leaveAt },
      });
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Не удалось сохранить пару.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="modal" aria-label="Добавить пару">
      <div className="modal__panel">
        <header className="modal__head">
          <div>
            <p className="eyebrow">Ручная пара</p>
            <h2>Добавить пару</h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Закрыть"
            onClick={onClose}
            disabled={saving}
          >
            <X size={17} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </header>
        <p className="modal__meta">
          Часовой пояс расписания: Красноярск (Asia/Krasnoyarsk)
        </p>

        <form className="modal__body" onSubmit={(event) => void search(event)}>
          <fieldset className="wizard-step">
            <legend>1. Найдите курс СДО</legend>
            <div className="wizard-search">
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="course-query">
                  Курс СДО или ссылка на курс
                </label>
                <input
                  id="course-query"
                  className="input"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setLookup(undefined);
                    setCandidateId('');
                  }}
                  required
                />
              </div>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={searching}
                style={{ alignSelf: 'flex-end' }}
              >
                <Search size={15} strokeWidth={1.8} aria-hidden="true" />
                {searching ? 'Поиск…' : 'Найти активность'}
              </button>
            </div>
          </fieldset>
        </form>

        <form className="modal__body" onSubmit={(event) => void save(event)}>
          <fieldset className="wizard-step">
            <legend>2. Укажите повторение</legend>
            <div className="radio-inline">
              <label>
                <input
                  type="radio"
                  name="schedule-kind"
                  checked={kind === 'once'}
                  onChange={() => setKind('once')}
                />
                Разово
              </label>
              <label>
                <input
                  type="radio"
                  name="schedule-kind"
                  checked={kind === 'weekly'}
                  onChange={() => setKind('weekly')}
                />
                Еженедельно
              </label>
            </div>
            {kind === 'once' ? (
              <div className="field">
                <label htmlFor="manual-date">Дата</label>
                <input
                  id="manual-date"
                  className="input"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>
            ) : (
              <div className="weekday-row" aria-label="Дни недели">
                {weekdays.map(([day, label]) => (
                  <label className="weekday" key={day}>
                    <input
                      type="checkbox"
                      checked={days.includes(day)}
                      onChange={() => toggleDay(day)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <fieldset className="wizard-step">
            <legend>3. Укажите время</legend>
            <div className="field-row">
              <div className="field">
                <label htmlFor="manual-join">Вход</label>
                <input
                  id="manual-join"
                  className="input"
                  type="time"
                  value={joinAt}
                  onChange={(event) => setJoinAt(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="manual-leave">Выход</label>
                <input
                  id="manual-leave"
                  className="input"
                  type="time"
                  value={leaveAt}
                  onChange={(event) => setLeaveAt(event.target.value)}
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="wizard-step">
            <legend>4. Подтвердите BBB-активность</legend>
            {lookup?.status === 'not_found' ? (
              <p role="status" className="wizard-note">
                Активность не найдена. Измените запрос и попробуйте снова.
              </p>
            ) : null}
            {lookup?.status === 'auth_required' ? (
              <p role="alert" className="wizard-note">
                Сессия СДО истекла.{' '}
                <button
                  type="button"
                  className="link-button"
                  onClick={onAuthRequired}
                >
                  Войти снова
                </button>
              </p>
            ) : null}
            {lookup && 'candidates' in lookup ? (
              <div
                className="candidates"
                role="radiogroup"
                aria-label="BBB-активности"
              >
                {lookup.candidates.map((candidate) => (
                  <label className="candidate" key={candidate.id}>
                    <input
                      type="radio"
                      name="activity"
                      value={candidate.id}
                      checked={candidateId === candidate.id}
                      onChange={() => {
                        setCandidateId(candidate.id);
                        if (!title) setTitle(candidate.name);
                      }}
                    />
                    {candidate.type === 'lecture' ? (
                      <Video
                        className="candidate__icon"
                        size={15}
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                    ) : (
                      <BookOpen
                        className="candidate__icon"
                        size={15}
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                    )}
                    <span className="candidate__body">
                      <b>{candidate.name}</b>
                      <small>
                        {candidate.courseName} ·{' '}
                        {candidate.type === 'lecture' ? 'лекция' : 'практика'}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="manual-title">Название пары</label>
              <input
                id="manual-title"
                className="input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
          </fieldset>

          {error ? (
            <p role="alert" className="alert alert--error">
              {error}
            </p>
          ) : null}
          <div className="modal__actions">
            <button
              type="submit"
              className="btn btn--primary"
              disabled={saving}
            >
              <Save size={15} strokeWidth={1.8} aria-hidden="true" />
              {saving ? 'Сохранение…' : 'Сохранить пару'}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onClose}
              disabled={saving}
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
