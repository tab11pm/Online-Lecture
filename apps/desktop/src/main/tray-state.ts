import { DateTime } from 'luxon';
import type { LecturesView } from '../shared/lectures.js';

export interface TrayState {
  tooltip: string;
  status: string;
  canStop: boolean;
}

function build(status: string, canStop: boolean): TrayState {
  return { tooltip: `Online Lecture — ${status}`, status, canStop };
}

export function trayStateFromView(view: LecturesView): TrayState {
  if (view.current) {
    const leave = DateTime.fromISO(view.current.leaveAt, { setZone: true });
    const time = leave.isValid ? leave.toFormat('HH:mm') : view.current.leaveAt;
    return build(`Лекция: ${view.current.title} до ${time}`, true);
  }
  if (view.next) {
    const date = DateTime.fromISO(view.next.date);
    const day = date.isValid ? date.toFormat('dd.MM') : view.next.date;
    return build(
      `Ближайшая: ${day} ${view.next.joinAt} ${view.next.title}`,
      false,
    );
  }
  return build('Онлайн-пар нет', false);
}
