import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import { CHANNELS } from '../shared/ipc-contract.js';
import type {
  CoreNotification,
  CoreStatus,
  DesktopApi,
  LoginInput,
} from '../shared/ipc-contract.js';
import type { OnboardingState } from '../shared/onboarding.js';
import type { LecturesView } from '../shared/lectures.js';
import type { BrowserChoice, BrowserView } from '../shared/browser-choice.js';
import type { EditImportedTimeInput, ManualScheduleInput, RescheduleInput } from '@core/core/schedule-editing.js';

function subscribe<T>(
  channel: string,
): (listener: (payload: T) => void) => () => void {
  return (listener) => {
    const handler = (_event: IpcRendererEvent, payload: T): void => {
      listener(payload);
    };
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  };
}

const api: DesktopApi = {
  onboarding: {
    getState: () => ipcRenderer.invoke(CHANNELS.onboarding.getState),
    login: (input: LoginInput) =>
      ipcRenderer.invoke(CHANNELS.onboarding.login, input),
    openManualSso: () => ipcRenderer.invoke(CHANNELS.onboarding.openManualSso),
    checkSession: () => ipcRenderer.invoke(CHANNELS.onboarding.checkSession),
    onChanged: subscribe<OnboardingState>(CHANNELS.onboarding.changed),
  },
  app: {
    getInfo: () => ipcRenderer.invoke(CHANNELS.app.getInfo),
    getBrowser: () => ipcRenderer.invoke(CHANNELS.app.getBrowser),
    setBrowser: (choice: BrowserChoice) =>
      ipcRenderer.invoke(CHANNELS.app.setBrowser, choice),
    installChromium: () => ipcRenderer.invoke(CHANNELS.app.installChromium),
    onBrowserChanged: subscribe<BrowserView>(CHANNELS.app.browserChanged),
    setAutostart: (enabled: boolean) =>
      ipcRenderer.invoke(CHANNELS.app.setAutostart, enabled),
    quit: () => ipcRenderer.invoke(CHANNELS.app.quit),
    getShowLectureWindow: () =>
      ipcRenderer.invoke(CHANNELS.app.getShowLectureWindow),
    setShowLectureWindow: (show: boolean) =>
      ipcRenderer.invoke(CHANNELS.app.setShowLectureWindow, show),
  },
  lectures: {
    getView: () => ipcRenderer.invoke(CHANNELS.lectures.getView),
    importNow: () => ipcRenderer.invoke(CHANNELS.lectures.importNow),
    stopCurrent: () => ipcRenderer.invoke(CHANNELS.lectures.stopCurrent),
    setSkipped: (jobId: string, occurrenceId: string, skipped: boolean) =>
      ipcRenderer.invoke(
        CHANNELS.lectures.setSkipped,
        jobId,
        occurrenceId,
        skipped,
      ),
    resolveManualTarget: (query: string) => ipcRenderer.invoke(CHANNELS.lectures.resolveManualTarget, query),
    saveManual: (input: { candidateId: string; title: string; schedule: ManualScheduleInput }) => ipcRenderer.invoke(CHANNELS.lectures.saveManual, input),
    editImportedTime: (input: EditImportedTimeInput) => ipcRenderer.invoke(CHANNELS.lectures.editImportedTime, input),
    reschedule: (input: RescheduleInput) => ipcRenderer.invoke(CHANNELS.lectures.reschedule, input),
    cancelReschedule: (jobId: string) => ipcRenderer.invoke(CHANNELS.lectures.cancelReschedule, jobId),
    deleteLecture: (jobId: string, date?: string) => ipcRenderer.invoke(CHANNELS.lectures.deleteLecture, jobId, date),
    onChanged: subscribe<LecturesView>(CHANNELS.lectures.changed),
  },
  core: {
    getStatus: () => ipcRenderer.invoke(CHANNELS.core.getStatus),
    start: () => ipcRenderer.invoke(CHANNELS.core.start),
    stop: () => ipcRenderer.invoke(CHANNELS.core.stop),
    onStatusChanged: subscribe<CoreStatus>(CHANNELS.core.statusChanged),
    onNotification: subscribe<CoreNotification>(CHANNELS.core.notification),
  },
};

contextBridge.exposeInMainWorld('desktop', api);
