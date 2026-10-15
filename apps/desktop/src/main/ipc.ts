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

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : 'Не удалось выполнить операцию.';
}
