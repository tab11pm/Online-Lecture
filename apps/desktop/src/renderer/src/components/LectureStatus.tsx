import {
  Activity,
  CalendarOff,
  CircleStop,
  Clock3,
  History,
  LoaderCircle,
  Radio,
  TriangleAlert,
} from 'lucide-react';
import type { RunStatus } from '@core/core/types.js';
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

const connectionFeedback: Record<
  RunStatus,
  { label: string; hint: string; tone: 'amber' | 'green' | 'red' | 'neutral' }
> = {
  scheduled: {
    label: 'Подготовка',
    hint: 'Готовимся к автоматическому входу в лекцию.',
    tone: 'amber',
  },
  resolving: {
    label: 'Ищем лекцию',
    hint: 'Ищем онлайн-занятие в вашем курсе СДО.',
    tone: 'amber',
  },
  joining: {
    label: 'Подключаемся',
    hint: 'Открываем лекцию и подключаем звук в режиме слушателя.',
    tone: 'amber',
  },
  waiting_room: {
    label: 'Ожидаем преподавателя',
    hint: 'Комната ещё не открыта. Продолжим ожидание до времени выхода.',
    tone: 'amber',
  },
  connected: { label: 'Сейчас', hint: '', tone: 'green' },
  reconnecting: {
    label: 'Восстанавливаем соединение',
    hint: 'Связь прервалась. Приложение пробует подключиться повторно.',
    tone: 'amber',
  },
  leaving: {
    label: 'Завершаем подключение',
    hint: 'Закрываем подключение к лекции. Дождитесь завершения.',
    tone: 'amber',
  },
  completed: {
    label: 'Пара завершена',
    hint: 'Результат запуска сохранён в журнале.',
    tone: 'green',
  },
  skipped: {
    label: 'Пара пропущена',
    hint: 'Автоматического подключения к этой паре не будет.',
    tone: 'neutral',
  },
  blocked: {
    label: 'Нужно ваше внимание',
    hint: 'Автоматическое подключение остановлено. Подробности — в журнале.',
    tone: 'red',
  },
  failed: {
    label: 'Не удалось подключиться',
    hint: 'Попытки подключения завершились ошибкой. Подробности — в журнале.',
    tone: 'red',
  },
};

const terminalStates = new Set<RunStatus>([
  'completed',
  'skipped',
  'blocked',
  'failed',
]);

export function LectureStatus({ view, onStop }: LectureStatusProps) {
  const { current, next, lastRun } = view;
  const feedback = current ? connectionFeedback[current.status] : undefined;
  return (
    <section className="card status-card" aria-label="Статус">
      <div className="card__head">
        <h2>
          <Activity size={17} strokeWidth={1.8} aria-hidden="true" />
          Статус
        </h2>
      </div>
      {current && feedback ? (
        <div className="status-card__live">
          <div className="status-card__flags">
            <span
              className={`chip${feedback.tone === 'neutral' ? '' : ` chip--${feedback.tone}`}`}
            >
              {current.status === 'connected' ? (
                <Radio size={12} strokeWidth={2} aria-hidden="true" />
              ) : feedback.tone === 'red' ? (
                <TriangleAlert size={12} aria-hidden="true" />
              ) : !terminalStates.has(current.status) ? (
                <LoaderCircle className="spin" size={12} aria-hidden="true" />
              ) : null}
              {feedback.label}
            </span>
            {current.status === 'connected' ? (
              <span className="chip">Только слушаю</span>
            ) : null}
          </div>
          <p className="status-card__now">
            {current.status === 'connected'
              ? `Сейчас идёт: ${current.title}, до ${isoClock(current.leaveAt)}`
              : current.title}
          </p>
          <p
            className={`status-card__state${feedback.hint ? ' status-card__hint' : ''}`}
            role="status"
          >
            {feedback.hint || `Состояние: ${runStatusLabels[current.status]}`}
          </p>
          {current.status !== 'connected' &&
          !terminalStates.has(current.status) ? (
            <p className="status-card__deadline">
              Автоматический выход в {isoClock(current.leaveAt)}
            </p>
          ) : null}
          {!terminalStates.has(current.status) ? (
            <div className="status-card__actions">
              <button
                type="button"
                className="btn btn--danger"
                onClick={onStop}
              >
                <CircleStop size={15} strokeWidth={1.8} aria-hidden="true" />
                Остановить
              </button>
            </div>
          ) : null}
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
          <p className="empty-state__title">Пока нет запланированных пар</p>
          <p className="empty-state__text">
            Обновите расписание или добавьте пару вручную.
          </p>
        </div>
      )}
      {lastRun ? (
        <p
          className={`status-card__last${lastRun.status === 'failed' || lastRun.status === 'blocked' ? ' is-error' : ''}`}
        >
          {lastRun.status === 'failed' || lastRun.status === 'blocked' ? (
            <TriangleAlert size={14} aria-hidden="true" />
          ) : (
            <History size={13} strokeWidth={1.8} aria-hidden="true" />
          )}
          Последний запуск: {lastRun.title} — {runStatusLabels[lastRun.status]}
          {lastRun.completionReason
            ? `, ${completionReasonLabels[lastRun.completionReason]}`
            : ''}
        </p>
      ) : null}
    </section>
  );
}
