import type { LoginInput } from './ipc-contract.js';
import type { LoginOutcome, OnboardingState } from './onboarding.js';
import type { BrowserChoice } from './browser-choice.js';
import type { LecturesView } from './lectures.js';

export type MainCommand =
  | { type: 'onboarding.login'; input: LoginInput }
  | { type: 'onboarding.openManualSso' }
  | { type: 'onboarding.checkSession' }
  | { type: 'onboarding.getState' }
  | { type: 'browser.setChoice'; choice: BrowserChoice }
  | { type: 'lectures.getView' }
  | { type: 'lectures.import' }
  | { type: 'lectures.stopCurrent' }
  | {
      type: 'lectures.setSkipped';
      jobId: string;
      occurrenceId: string;
      skipped: boolean;
    }
  | { type: 'lectures.setShowWindow'; show: boolean }
  | { type: 'system.resumed' }
  | { type: 'app.shutdown' };

export type HostEvent =
  | { type: 'host.ready' }
  | { type: 'onboarding.changed'; state: OnboardingState }
  | { type: 'onboarding.loginResult'; outcome: LoginOutcome }
  | { type: 'lectures.changed'; view: LecturesView }
  | { type: 'host.shutdownComplete' }
  | { type: 'host.error'; message: string };
