import type { LoginOutcome, OnboardingState } from '../shared/onboarding.js';

export interface CredentialsInput {
  username: string;
  password: string;
}

export interface OnboardingDependencies {
  login(input: CredentialsInput): Promise<LoginOutcome>;
  openManualSso(): Promise<LoginOutcome>;
  checkSession(): Promise<boolean>;
}

export type OnboardingListener = (state: OnboardingState) => void;

const INVALID_CREDENTIALS_MESSAGE = 'Неверный логин или пароль.';
const LOGIN_ERROR_MESSAGE =
  'Не удалось войти. Проверьте подключение и попробуйте ещё раз.';
const MANUAL_SSO_ERROR_MESSAGE =
  'Не удалось открыть окно входа. Попробуйте ещё раз.';

export class OnboardingMachine {
  private state: OnboardingState = { phase: 'welcome' };
  private readonly listeners = new Set<OnboardingListener>();
  private busy = false;

  constructor(private readonly deps: OnboardingDependencies) {}

  getState(): OnboardingState {
    return this.state;
  }

  start(): OnboardingState {
    this.setState({ phase: 'welcome' });
    return this.state;
  }

  onChange(listener: OnboardingListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async submitCredentials(input: CredentialsInput): Promise<OnboardingState> {
    if (this.busy) {
      return this.state;
    }
    this.busy = true;
    this.setState({ phase: 'authenticating' });
    try {
      const outcome = await this.deps.login(input);
      if (outcome.ok) {
        this.setState({ phase: 'session_ready' });
      } else if (
        outcome.reason === 'captcha' ||
        outcome.reason === 'two_factor'
      ) {
        this.setState({ phase: 'manual_sso' });
      } else {
        this.setState({
          phase: 'credentials',
          error: this.errorMessage(outcome),
        });
      }
    } catch {
      this.setState({ phase: 'credentials', error: LOGIN_ERROR_MESSAGE });
    } finally {
      this.busy = false;
    }
    return this.state;
  }

  async openManualSso(): Promise<OnboardingState> {
    if (this.busy) {
      return this.state;
    }
    this.busy = true;
    this.setState({ phase: 'manual_sso' });
    try {
      const outcome = await this.deps.openManualSso();
      if (outcome.ok) {
        this.setState({ phase: 'session_ready' });
      } else {
        this.setState({
          phase: 'credentials',
          error: this.errorMessage(outcome),
        });
      }
    } catch {
      this.setState({ phase: 'credentials', error: MANUAL_SSO_ERROR_MESSAGE });
    } finally {
      this.busy = false;
    }
    return this.state;
  }

  async checkSession(): Promise<OnboardingState> {
    const valid = await this.deps.checkSession();
    this.setState(
      valid ? { phase: 'session_ready' } : { phase: 'credentials' },
    );
    return this.state;
  }

  private errorMessage(outcome: Extract<LoginOutcome, { ok: false }>): string {
    switch (outcome.reason) {
      case 'invalid':
        return INVALID_CREDENTIALS_MESSAGE;
      default:
        return LOGIN_ERROR_MESSAGE;
    }
  }

  private setState(next: OnboardingState): void {
    this.state = next;
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
