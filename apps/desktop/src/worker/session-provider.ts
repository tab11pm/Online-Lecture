import type { LoginOutcome } from '../shared/onboarding.js';
import type { BrowserChoice } from '../shared/browser-choice.js';

export interface LoginCredentials {
  username: string;
  password: string;
  authStatePath: string;
}

export interface SessionProvider {
  setBrowserChoice?(choice: BrowserChoice): void;
  loginWithCredentials(input: LoginCredentials): Promise<LoginOutcome>;
  openManualLogin(authStatePath: string): Promise<LoginOutcome>;
  checkSession(authStatePath: string): Promise<boolean>;
}
