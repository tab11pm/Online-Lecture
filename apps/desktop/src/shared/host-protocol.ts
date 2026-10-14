import type { LoginInput } from './ipc-contract.js';
import type { LoginOutcome, OnboardingState } from './onboarding.js';
import type { BrowserChoice } from './browser-choice.js';

export type MainCommand =
  | { type: 'onboarding.login'; input: LoginInput }
  | { type: 'onboarding.openManualSso' }
  | { type: 'onboarding.checkSession' }
  | { type: 'onboarding.getState' }
  | { type: 'browser.setChoice'; choice: BrowserChoice };

export type HostEvent =
  | { type: 'host.ready' }
  | { type: 'onboarding.changed'; state: OnboardingState }
  | { type: 'onboarding.loginResult'; outcome: LoginOutcome }
  | { type: 'host.error'; message: string };
