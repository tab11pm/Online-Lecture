import type { CompletionReason, RunStatus } from '@core/core/types.js';

export const runStatusLabels: Record<RunStatus, string> = {
  scheduled: 'запланирована',
  resolving: 'поиск лекции',
  joining: 'подключение',
  waiting_room: 'ожидание преподавателя',
  connected: 'подключено',
  reconnecting: 'переподключение',
  leaving: 'выход',
  completed: 'завершена',
  skipped: 'пропущена',
  blocked: 'заблокирована',
  failed: 'ошибка',
};

export const completionReasonLabels: Record<CompletionReason, string> = {
  meeting_ended: 'встреча завершена',
  deadline: 'время пары истекло',
  manual: 'остановлено вручную',
  error: 'ошибка',
};

const weekdays = [
  'воскресенье',
  'понедельник',
  'вторник',
  'среда',
  'четверг',
  'пятница',
  'суббота',
];

/** Weekday of a YYYY-MM-DD lecture date; no timezone conversion involved. */
export function weekdayName(date: string): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return weekdays[new Date(year, month - 1, day).getDay()] ?? '';
}

/** HH:MM taken verbatim from an ISO string, keeping its own offset. */
export function isoClock(iso: string): string {
  return iso.slice(11, 16);
}
