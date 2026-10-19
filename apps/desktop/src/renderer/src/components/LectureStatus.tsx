import {
  Activity,
  CalendarOff,
  CircleStop,
  Clock3,
  History,
  Radio,
} from 'lucide-react';
import type { LecturesView } from '../../../shared/lectures.js';
import {
  completionReasonLabels,
  isoClock,
  runStatusLabels,
  weekdayName,
} from '../lecture-labels';

export interface LectureStatusProps {
  view: LecturesView;
  onStop(): void;
}

export function LectureStatus({ view, onStop }: LectureStatusProps) {
  const { current, next, lastRun } = view;
  return (
    <section className="card status-card" aria-label="Статус">
      <div className="card__head">
        <h2>
          <Activity size={17} strokeWidth={1.8} aria-hidden="true" />
          Статус
        </h2>
      </div>
      {current ? (
        <div className="status-card__live">
          <div className="status-card__flags">
            <span className="chip chip--amber">
              <Radio size={10} strokeWidth={2} aria-hidden="true" />
              Сейчас
            </span>
            <span className="chip">Только слушаю</span>
          </div>
          <p className="status-card__now">
            {`Сейчас идёт: ${current.title}, до ${isoClock(current.leaveAt)}`}
          </p>
          <p className="status-card__state">
            Состояние: {runStatusLabels[current.status]}
          </p>
          <p className="status-card__deadline">
            Окончание в {isoClock(current.leaveAt)}
          </p>
          <div className="status-card__actions">
            <button type="button" className="btn btn--danger" onClick={onStop}>
              <CircleStop size={15} strokeWidth={1.8} aria-hidden="true" />
              Остановить
            </button>
          </div>
        </div>
      ) : next ? (
        <div className="status-card__next">
          <div className="status-card__flags">
            <span className="chip chip--amber">
              <Clock3 size={10} strokeWidth={2} aria-hidden="true" />
              Дальше
            </span>
            <span className="chip">
              {next.source === 'manual' ? 'вручную' : 'из расписания'}
            </span>
          </div>
          <p className="status-card__now">
            Ближайшая: {weekdayName(next.date)} {next.joinAt} {next.title}
          </p>
        </div>
      ) : (
        <div className="empty-state">
          <CalendarOff
            className="empty-state__icon"
            size={22}
            strokeWidth={1.6}
            aria-hidden="true"
          />
          <p className="empty-state__title">Онлайн-пар не найдено</p>
          <p className="empty-state__text">
            Обновите расписание или добавьте пару вручную.
          </p>
        </div>
      )}
      {lastRun ? (
        <p className="status-card__last">
          <History size={13} strokeWidth={1.8} aria-hidden="true" />
          Последний запуск: {lastRun.title} — {runStatusLabels[lastRun.status]}
          {lastRun.completionReason
            ? `, ${completionReasonLabels[lastRun.completionReason]}`
            : ''}
        </p>
      ) : null}
    </section>
  );
}
