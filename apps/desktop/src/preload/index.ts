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
    setAutostart: (enabled: boolean) =>
      ipcRenderer.invoke(CHANNELS.app.setAutostart, enabled),
    quit: () => ipcRenderer.invoke(CHANNELS.app.quit),
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
