import type { LoginOutcome, OnboardingState } from './onboarding.js';
import type { LecturesView } from './lectures.js';
import type { BrowserChoice, BrowserView } from './browser-choice.js';

export interface AppInfo {
  version: string;
  autostart: boolean;
}

export type CoreStatus = 'idle' | 'starting' | 'running' | 'stopped' | 'error';

export type CoreNotificationLevel = 'info' | 'warn' | 'error';

export interface CoreNotification {
  level: CoreNotificationLevel;
  message: string;
}

export interface LoginInput {
  username: string;
  password: string;
}

export const CHANNELS = {
  onboarding: {
    getState: 'onboarding:getState',
    login: 'onboarding:login',
    openManualSso: 'onboarding:openManualSso',
    checkSession: 'onboarding:checkSession',
    changed: 'onboarding:changed',
  },
  app: {
    getInfo: 'app:getInfo',
    getBrowser: 'app:getBrowser',
    setBrowser: 'app:setBrowser',
    installChromium: 'app:installChromium',
    browserChanged: 'app:browserChanged',
    setAutostart: 'app:setAutostart',
    quit: 'app:quit',
    getShowLectureWindow: 'app:getShowLectureWindow',
    setShowLectureWindow: 'app:setShowLectureWindow',
  },
  lectures: {
    getView: 'lectures:getView',
    importNow: 'lectures:importNow',
    stopCurrent: 'lectures:stopCurrent',
    setSkipped: 'lectures:setSkipped',
    changed: 'lectures:changed',
  },
  core: {
    getStatus: 'core:getStatus',
    start: 'core:start',
    stop: 'core:stop',
    statusChanged: 'core:statusChanged',
    notification: 'core:notification',
  },
} as const;

export interface DesktopApi {
  onboarding: {
    getState(): Promise<OnboardingState>;
    login(input: LoginInput): Promise<LoginOutcome>;
    openManualSso(): Promise<LoginOutcome>;
    checkSession(): Promise<OnboardingState>;
    onChanged(listener: (state: OnboardingState) => void): () => void;
  };
  app: {
    getInfo(): Promise<AppInfo>;
    getBrowser(): Promise<BrowserView>;
    setBrowser(choice: BrowserChoice): Promise<BrowserView>;
    installChromium(): Promise<BrowserView>;
    onBrowserChanged(listener: (view: BrowserView) => void): () => void;
    setAutostart(enabled: boolean): Promise<AppInfo>;
    quit(): Promise<void>;
    getShowLectureWindow(): Promise<boolean>;
    setShowLectureWindow(show: boolean): Promise<boolean>;
  };
  lectures: {
    getView(): Promise<LecturesView>;
    importNow(): Promise<void>;
    stopCurrent(): Promise<void>;
    setSkipped(
      jobId: string,
      occurrenceId: string,
      skipped: boolean,
    ): Promise<void>;
    onChanged(listener: (view: LecturesView) => void): () => void;
  };
  core: {
    getStatus(): Promise<CoreStatus>;
    start(): Promise<CoreStatus>;
    stop(): Promise<CoreStatus>;
    onStatusChanged(listener: (status: CoreStatus) => void): () => void;
    onNotification(
      listener: (notification: CoreNotification) => void,
    ): () => void;
  };
}
