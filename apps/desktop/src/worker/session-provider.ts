import type { LoginOutcome } from '../shared/onboarding.js';

export interface LoginCredentials {
  username: string;
  password: string;
  authStatePath: string;
}

export interface SessionProvider {
  loginWithCredentials(input: LoginCredentials): Promise<LoginOutcome>;
  openManualLogin(authStatePath: string): Promise<LoginOutcome>;
  checkSession(authStatePath: string): Promise<boolean>;
}
