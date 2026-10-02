import type { LoginInput } from './ipc-contract.js';
import type { LoginOutcome, OnboardingState } from './onboarding.js';

export type MainCommand =
  | { type: 'onboarding.login'; input: LoginInput }
  | { type: 'onboarding.openManualSso' }
  | { type: 'onboarding.checkSession' }
  | { type: 'onboarding.getState' }
  | { type: 'app.paths' };

export type HostEvent =
  | { type: 'onboarding.changed'; state: OnboardingState }
  | { type: 'onboarding.loginResult'; outcome: LoginOutcome }
  | { type: 'host.error'; message: string };
