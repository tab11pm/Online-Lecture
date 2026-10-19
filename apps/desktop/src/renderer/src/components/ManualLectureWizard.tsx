import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { BookOpen, Save, Search, Video, X } from 'lucide-react';
import type { ManualTargetLookup } from '../../../shared/lectures.js';
import type { Weekday } from '@core/core/types.js';
import { desktop } from '../api';
import {
  isValidClockTime,
  normalizeClockTime,
  toIsoDate,
} from '../date-time-input';
import { Modal } from './Modal';

const weekdays: Array<[Weekday, string]> = [
  ['mon', 'Пн'],
  ['tue', 'Вт'],
  ['wed', 'Ср'],
  ['thu', 'Чт'],
  ['fri', 'Пт'],
  ['sat', 'Сб'],
  ['sun', 'Вс'],
];
type FieldName = 'candidate' | 'date' | 'days' | 'joinAt' | 'leaveAt' | 'title';

export function ManualLectureWizard({
  onClose,
  onAuthRequired,
  active = true,
}: {
  onClose(): void;
  onAuthRequired?(): void;
  active?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [lookup, setLookup] = useState<ManualTargetLookup>();
  const [candidateId, setCandidateId] = useState('');
  const [title, setTitle] = useState('');
  const [titleEdited, setTitleEdited] = useState(false);
  const [kind, setKind] = useState<'once' | 'weekly'>('once');
  const [date, setDate] = useState('');
  const [days, setDays] = useState<Weekday[]>([]);
  const [joinAt, setJoinAt] = useState('');
  const [leaveAt, setLeaveAt] = useState('');
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<FieldName, string>>
  >({});
  const requestId = useRef(0);
  useEffect(
    () => () => {
      requestId.current += 1;
    },
    [],
  );

  async function search(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!query.trim() || searching) return;
    const currentRequest = ++requestId.current;
    setSearchError(undefined);
    setSaveError(undefined);
    setCandidateId('');
    setLookup(undefined);
    setSearching(true);
    try {
      const result = await desktop.lectures.resolveManualTarget(query.trim());
      if (requestId.current === currentRequest) setLookup(result);
    } catch (reason) {
      if (requestId.current === currentRequest) {
        setSearchError(
          `Поиск не выполнен: ${reason instanceof Error ? reason.message : 'проверьте подключение и попробуйте снова.'}`,
        );
      }
    } finally {
      if (requestId.current === currentRequest) setSearching(false);
    }
  }

  function selectCandidate(id: string, name: string) {
    setCandidateId(id);
    if (!titleEdited) setTitle(name);
    setFieldErrors((errors) => ({ ...errors, candidate: undefined }));
  }

  function toggleDay(day: Weekday) {
    setDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day],
    );
    setFieldErrors((errors) => ({ ...errors, days: undefined }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaveError(undefined);
    const nextErrors: Partial<Record<FieldName, string>> = {};
    const isoDate = kind === 'once' ? toIsoDate(date) : undefined;
    const normalizedJoin = normalizeClockTime(joinAt);
    const normalizedLeave = normalizeClockTime(leaveAt);
    if (!candidateId)
      nextErrors.candidate = 'Подтвердите BBB-активность в результатах поиска.';
    if (kind === 'once' && !isoDate)
      nextErrors.date = 'Введите существующую дату в формате ДД.ММ.ГГГГ.';
    if (kind === 'weekly' && days.length === 0)
      nextErrors.days = 'Выберите хотя бы один день недели.';
    if (!isValidClockTime(normalizedJoin))
      nextErrors.joinAt = 'Введите время в формате ЧЧ:ММ (00:00–23:59).';
    if (!isValidClockTime(normalizedLeave))
      nextErrors.leaveAt = 'Введите время в формате ЧЧ:ММ (00:00–23:59).';
    else if (
      isValidClockTime(normalizedJoin) &&
      normalizedLeave <= normalizedJoin
    )
      nextErrors.leaveAt = 'Время выхода должно быть позже времени входа.';
    if (!title.trim()) nextErrors.title = 'Укажите название пары.';
    setFieldErrors(nextErrors);
    const firstInvalid = Object.keys(nextErrors)[0] as FieldName | undefined;
    if (firstInvalid) {
      const targetId: Record<FieldName, string> = {
        candidate: 'candidate-results',
        date: 'manual-date',
        days: 'manual-days',
        joinAt: 'manual-join',
        leaveAt: 'manual-leave',
        title: 'manual-title',
      };
      window.setTimeout(() => {
        const target =
          firstInvalid === 'candidate' && !lookup
            ? document.getElementById('course-query')
            : document.getElementById(targetId[firstInvalid]);
        target?.focus();
      }, 0);
      return;
    }

    setSaving(true);
    try {
      await desktop.lectures.saveManual({
        candidateId,
        title: title.trim(),
        schedule:
          kind === 'once'
            ? {
                type: 'once',
                date: isoDate!,
                joinAt: normalizedJoin,
                leaveAt: normalizedLeave,
              }
            : {
                type: 'weekly',
                days,
                joinAt: normalizedJoin,
                leaveAt: normalizedLeave,
              },
      });
      onClose();
    } catch (reason) {
      setSaveError(
        reason instanceof Error ? reason.message : 'Не удалось сохранить пару.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      titleId="manual-lecture-title"
      onClose={onClose}
      busy={saving}
      active={active}
    >
      <header className="modal__head">
        <div>
          <p className="eyebrow">Ручная пара</p>
          <h2 id="manual-lecture-title">Добавить пару</h2>
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

      <div className="modal__scroll">
        <form
          id="wizard-save"
          className="modal__body"
          onSubmit={(event) => void save(event)}
        >
          <fieldset className="wizard-step">
            <legend>1. Курс и активность</legend>
            <div className="wizard-search">
              <div className="field wizard-search__field">
                <label htmlFor="course-query">
                  Курс СДО или ссылка на курс
                </label>
                <input
                  id="course-query"
                  className="input"
                  value={query}
                  aria-invalid={Boolean(fieldErrors.candidate && !lookup)}
                  aria-describedby={
                    fieldErrors.candidate && !lookup
                      ? 'candidate-error'
                      : undefined
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void search();
                    }
                  }}
                  onChange={(event) => {
                    requestId.current += 1;
                    setQuery(event.target.value);
                    setLookup(undefined);
                    setCandidateId('');
                    setSearchError(undefined);
                    setSearching(false);
                  }}
                />
              </div>
              <button
                type="button"
                className="btn btn--primary wizard-search__button"
                disabled={searching || !query.trim()}
                onClick={() => void search()}
              >
                <Search size={15} strokeWidth={1.8} aria-hidden="true" />
                {searching ? 'Поиск…' : 'Найти активность'}
              </button>
            </div>
            {searchError ? (
              <p role="alert" className="field-error">
                {searchError}
              </p>
            ) : null}
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
                id="candidate-results"
                className="candidates"
                role="group"
                aria-label="Выберите BBB-активность"
                tabIndex={fieldErrors.candidate ? 0 : -1}
                aria-invalid={Boolean(fieldErrors.candidate)}
                aria-describedby={
                  fieldErrors.candidate ? 'candidate-error' : undefined
                }
              >
                {lookup.candidates.map((candidate) => (
                  <button
                    className="candidate"
                    key={candidate.id}
                    type="button"
                    aria-pressed={candidateId === candidate.id}
                    onClick={() =>
                      selectCandidate(candidate.id, candidate.name)
                    }
                  >
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
                    {candidateId === candidate.id ? (
                      <span className="candidate__selected">Выбрано</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
            {fieldErrors.candidate ? (
              <p id="candidate-error" className="field-error">
                {fieldErrors.candidate}
              </p>
            ) : null}
          </fieldset>

          <fieldset className="wizard-step">
            <legend>2. Повторение и дата</legend>
            <div className="radio-inline">
              <label>
                <input
                  type="radio"
                  name="schedule-kind"
                  checked={kind === 'once'}
                  onChange={() => {
                    setKind('once');
                    setFieldErrors({});
                  }}
                />
                Разово
              </label>
              <label>
                <input
                  type="radio"
                  name="schedule-kind"
                  checked={kind === 'weekly'}
                  onChange={() => {
                    setKind('weekly');
                    setFieldErrors({});
                  }}
                />
                Еженедельно
              </label>
            </div>
            {kind === 'once' ? (
              <div className="field">
                <label htmlFor="manual-date">Дата</label>
                <span className="field-hint" aria-hidden="true">
                  ДД.ММ.ГГГГ
                </span>
                <input
                  id="manual-date"
                  className="input"
                  type="text"
                  inputMode="numeric"
                  placeholder="ДД.ММ.ГГГГ"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.date)}
                  aria-describedby={
                    fieldErrors.date ? 'manual-date-error' : 'manual-date-hint'
                  }
                />
                <span id="manual-date-hint" className="sr-only">
                  Введите дату в формате день, месяц, год.
                </span>
                {fieldErrors.date ? (
                  <p id="manual-date-error" className="field-error">
                    {fieldErrors.date}
                  </p>
                ) : null}
              </div>
            ) : (
              <div
                id="manual-days"
                className="field"
                tabIndex={fieldErrors.days ? 0 : -1}
                aria-invalid={Boolean(fieldErrors.days)}
                aria-describedby={
                  fieldErrors.days ? 'manual-days-error' : undefined
                }
              >
                <span className="field__label">Дни недели</span>
                <div
                  className="weekday-row"
                  role="group"
                  aria-label="Дни недели"
                >
                  {weekdays.map(([day, label]) => (
                    <button
                      key={day}
                      type="button"
                      className="weekday"
                      aria-pressed={days.includes(day)}
                      onClick={() => toggleDay(day)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {fieldErrors.days ? (
                  <p id="manual-days-error" className="field-error">
                    {fieldErrors.days}
                  </p>
                ) : null}
              </div>
            )}
          </fieldset>

          <fieldset className="wizard-step">
            <legend>3. Время и название</legend>
            <div className="field-row">
              <div className="field">
                <label htmlFor="manual-join">Вход</label>
                <span className="field-hint" aria-hidden="true">
                  ЧЧ:ММ
                </span>
                <input
                  id="manual-join"
                  className="input"
                  type="text"
                  inputMode="numeric"
                  placeholder="09:00"
                  value={joinAt}
                  onChange={(event) => setJoinAt(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.joinAt)}
                  aria-describedby={
                    fieldErrors.joinAt
                      ? 'manual-join-error'
                      : 'manual-join-hint'
                  }
                />
                <span id="manual-join-hint" className="sr-only">
                  Формат ЧЧ:ММ, 24-часовое время.
                </span>
                {fieldErrors.joinAt ? (
                  <p id="manual-join-error" className="field-error">
                    {fieldErrors.joinAt}
                  </p>
                ) : null}
              </div>
              <div className="field">
                <label htmlFor="manual-leave">Выход</label>
                <span className="field-hint" aria-hidden="true">
                  ЧЧ:ММ
                </span>
                <input
                  id="manual-leave"
                  className="input"
                  type="text"
                  inputMode="numeric"
                  placeholder="10:30"
                  value={leaveAt}
                  onChange={(event) => setLeaveAt(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.leaveAt)}
                  aria-describedby={
                    fieldErrors.leaveAt
                      ? 'manual-leave-error'
                      : 'manual-leave-hint'
                  }
                />
                <span id="manual-leave-hint" className="sr-only">
                  Формат ЧЧ:ММ, 24-часовое время.
                </span>
                {fieldErrors.leaveAt ? (
                  <p id="manual-leave-error" className="field-error">
                    {fieldErrors.leaveAt}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="field">
              <label htmlFor="manual-title">Название пары</label>
              <input
                id="manual-title"
                className="input"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setTitleEdited(true);
                }}
                aria-invalid={Boolean(fieldErrors.title)}
                aria-describedby={
                  fieldErrors.title ? 'manual-title-error' : undefined
                }
              />
              {fieldErrors.title ? (
                <p id="manual-title-error" className="field-error">
                  {fieldErrors.title}
                </p>
              ) : null}
            </div>
          </fieldset>
        </form>
      </div>

      <footer className="modal__actions">
        {saveError ? (
          <p role="alert" className="field-error modal__error">
            {saveError}
          </p>
        ) : null}
        <button
          type="submit"
          form="wizard-save"
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
      </footer>
    </Modal>
  );
}
