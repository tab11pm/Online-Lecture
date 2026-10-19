import { redactSensitiveText } from '@core/core/redaction.js';
import { CHANNELS } from '../shared/ipc-contract.js';

export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => unknown,
  ): void;
}

export type IpcHandler = (...args: never[]) => unknown;

export type IpcHandlerMap = Record<string, IpcHandler>;

export const INVOKE_CHANNELS = [
  CHANNELS.onboarding.getState,
  CHANNELS.onboarding.login,
  CHANNELS.onboarding.openManualSso,
  CHANNELS.onboarding.checkSession,
  CHANNELS.app.getInfo,
  CHANNELS.app.getBrowser,
  CHANNELS.app.setBrowser,
  CHANNELS.app.installChromium,
  CHANNELS.app.setAutostart,
  CHANNELS.app.quit,
  CHANNELS.app.getShowLectureWindow,
  CHANNELS.app.setShowLectureWindow,
  CHANNELS.lectures.getView,
  CHANNELS.lectures.importNow,
  CHANNELS.lectures.stopCurrent,
  CHANNELS.lectures.setSkipped,
  CHANNELS.lectures.resolveManualTarget,
  CHANNELS.lectures.saveManual,
  CHANNELS.lectures.editImportedTime,
  CHANNELS.lectures.reschedule,
  CHANNELS.lectures.cancelReschedule,
  CHANNELS.lectures.deleteLecture,
  CHANNELS.core.getStatus,
  CHANNELS.core.start,
  CHANNELS.core.stop,
] as const;

export interface RegisterIpcDependencies {
  ipcMain: IpcMainLike;
  handlers: IpcHandlerMap;
}

export function registerIpc({
  ipcMain,
  handlers,
}: RegisterIpcDependencies): void {
  for (const channel of INVOKE_CHANNELS) {
    const handler = handlers[channel];
    if (!handler) {
      continue;
    }
    ipcMain.handle(channel, async (_event, ...args) => {
      try {
        validateLectureArgs(channel, args);
        const invoke = handler as unknown as (
          ...callArgs: unknown[]
        ) => unknown;
        return await invoke(...args);
      } catch (error) {
        throw new Error(redactSensitiveText(errorMessage(error)));
      }
    });
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Некорректные данные пары.');
  return value as Record<string, unknown>;
}

function nonempty(value: unknown): boolean {
  return (
    typeof value === 'string' && value.trim().length > 0 && value.length <= 500
  );
}

function date(value: unknown): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function time(value: unknown): boolean {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);
}

function validateLectureArgs(channel: string, args: unknown[]): void {
  const fail = () => {
    throw new Error('Некорректные данные пары.');
  };
  if (
    channel === CHANNELS.lectures.resolveManualTarget ||
    channel === CHANNELS.lectures.cancelReschedule
  ) {
    if (args.length !== 1 || !nonempty(args[0])) fail();
  } else if (channel === CHANNELS.lectures.deleteLecture) {
    if (
      !nonempty(args[0]) ||
      args.length > 2 ||
      (args[1] !== undefined &&
        (typeof args[1] !== 'string' ||
          !nonempty(args[1]) ||
          !args[1].startsWith(`${args[0]}:`)))
    )
      fail();
  } else if (channel === CHANNELS.lectures.saveManual) {
    if (args.length !== 1) fail();
    const input = record(args[0]);
    const schedule = record(input.schedule);
    if (
      !nonempty(input.candidateId) ||
      !nonempty(input.title) ||
      !time(schedule.joinAt) ||
      !time(schedule.leaveAt)
    )
      fail();
    if (schedule.type === 'once') {
      if (!date(schedule.date)) fail();
    } else if (schedule.type === 'weekly') {
      const days = schedule.days;
      if (
        !Array.isArray(days) ||
        days.length === 0 ||
        days.some(
          (day) =>
            !['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].includes(day),
        )
      )
        fail();
    } else fail();
  } else if (
    channel === CHANNELS.lectures.editImportedTime ||
    channel === CHANNELS.lectures.reschedule
  ) {
    if (args.length !== 1) fail();
    const input = record(args[0]);
    if (
      !nonempty(input.jobId) ||
      !date(input.date) ||
      (input.occurrenceId !== undefined &&
        (typeof input.occurrenceId !== 'string' ||
          !nonempty(input.occurrenceId) ||
          !input.occurrenceId.startsWith(`${input.jobId}:`)))
    )
      fail();
    if (
      channel === CHANNELS.lectures.editImportedTime &&
      (!time(input.joinAt) || !time(input.leaveAt))
    )
      fail();
    if (
      channel === CHANNELS.lectures.reschedule &&
      (!date(input.newDate) ||
        !time(input.newJoinAt) ||
        !time(input.newLeaveAt))
    )
      fail();
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : 'Не удалось выполнить операцию.';
}
