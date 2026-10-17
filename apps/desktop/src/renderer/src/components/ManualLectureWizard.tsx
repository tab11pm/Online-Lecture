import { useState } from 'react';
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

  async function search(event: React.FormEvent<HTMLFormElement>) {
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

  async function save(event: React.FormEvent<HTMLFormElement>) {
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
    <section className="manual-wizard" aria-label="Добавить пару">
      <h2>Добавить пару</h2>
      <p>Часовой пояс расписания: Красноярск (Asia/Krasnoyarsk)</p>
      <form onSubmit={(event) => void search(event)}>
        <fieldset>
          <legend>1. Найдите курс СДО</legend>
          <label>
            Курс СДО или ссылка на курс{' '}
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setLookup(undefined);
                setCandidateId('');
              }}
              required
            />
          </label>
          <button type="submit" disabled={searching}>
            {searching ? 'Поиск…' : 'Найти активность'}
          </button>
        </fieldset>
      </form>
      <form onSubmit={(event) => void save(event)}>
        <fieldset>
          <legend>2. Укажите повторение</legend>
          <label>
            <input
              type="radio"
              name="schedule-kind"
              checked={kind === 'once'}
              onChange={() => setKind('once')}
            />{' '}
            Разово
          </label>
          <label>
            <input
              type="radio"
              name="schedule-kind"
              checked={kind === 'weekly'}
              onChange={() => setKind('weekly')}
            />{' '}
            Еженедельно
          </label>
          {kind === 'once' ? (
            <label>
              Дата{' '}
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
          ) : (
            <div aria-label="Дни недели">
              {weekdays.map(([day, label]) => (
                <label key={day}>
                  <input
                    type="checkbox"
                    checked={days.includes(day)}
                    onChange={() => toggleDay(day)}
                  />{' '}
                  {label}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <fieldset>
          <legend>3. Укажите время</legend>
          <label>
            Вход{' '}
            <input
              type="time"
              value={joinAt}
              onChange={(event) => setJoinAt(event.target.value)}
            />
          </label>
          <label>
            Выход{' '}
            <input
              type="time"
              value={leaveAt}
              onChange={(event) => setLeaveAt(event.target.value)}
            />
          </label>
        </fieldset>
        <fieldset>
          <legend>4. Подтвердите BBB-активность</legend>
          {lookup?.status === 'not_found' ? (
            <p role="status">
              Активность не найдена. Измените запрос и попробуйте снова.
            </p>
          ) : null}
          {lookup?.status === 'auth_required' ? (
            <p role="alert">
              Сессия СДО истекла.{' '}
              <button type="button" onClick={onAuthRequired}>
                Войти снова
              </button>
            </p>
          ) : null}
          {lookup && 'candidates' in lookup ? (
            <div role="radiogroup" aria-label="BBB-активности">
              {lookup.candidates.map((candidate) => (
                <label key={candidate.id}>
                  <input
                    type="radio"
                    name="activity"
                    value={candidate.id}
                    checked={candidateId === candidate.id}
                    onChange={() => {
                      setCandidateId(candidate.id);
                      if (!title) setTitle(candidate.name);
                    }}
                  />{' '}
                  {candidate.name} · {candidate.courseName} ·{' '}
                  {candidate.type === 'lecture' ? 'лекция' : 'практика'}
                </label>
              ))}
            </div>
          ) : null}
          <label>
            Название пары{' '}
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
        </fieldset>
        {error ? <p role="alert">{error}</p> : null}
        <div className="manual-wizard__actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить пару'}
          </button>
          <button type="button" onClick={onClose} disabled={saving}>
            Отмена
          </button>
        </div>
      </form>
    </section>
  );
}
