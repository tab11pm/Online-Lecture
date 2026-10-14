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
    <section aria-label="Статус">
      <h2>Статус</h2>
      {current ? (
        <div>
          <p>
            Сейчас идёт: {current.title}, до {isoClock(current.leaveAt)}
          </p>
          <p>Состояние: {runStatusLabels[current.status]}</p>
          <button type="button" onClick={onStop}>
            Остановить
          </button>
        </div>
      ) : next ? (
        <p>
          Ближайшая: {weekdayName(next.date)} {next.joinAt} {next.title}
        </p>
      ) : (
        <p>Онлайн-пар не найдено</p>
      )}
      {lastRun ? (
        <p>
          Последний запуск: {lastRun.title} — {runStatusLabels[lastRun.status]}
          {lastRun.completionReason
            ? `, ${completionReasonLabels[lastRun.completionReason]}`
            : ''}
        </p>
      ) : null}
    </section>
  );
}
