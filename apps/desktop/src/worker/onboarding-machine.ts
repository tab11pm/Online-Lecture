import {
  isSdoMcpUnavailableError,
  type SdoMcpUnavailableError,
} from '@core/core/mcp-errors.js';
import type { LoginOutcome, OnboardingState } from '../shared/onboarding.js';

export interface CredentialsInput {
  username: string;
  password: string;
}

export interface OnboardingDependencies {
  login(input: CredentialsInput): Promise<LoginOutcome>;
  openManualSso(): Promise<LoginOutcome>;
  checkSession(): Promise<boolean>;
  /** Shown to the user when SDO MCP fails to start. */
  logPath?: string;
  /** Receives every error the machine turns into a state. */
  onError?(error: unknown): void;
}

export type OnboardingListener = (state: OnboardingState) => void;

const INVALID_CREDENTIALS_MESSAGE = 'Неверный логин или пароль.';
const LOGIN_ERROR_MESSAGE =
  'Не удалось войти. Проверьте подключение и попробуйте ещё раз.';
const MANUAL_SSO_ERROR_MESSAGE =
  'Не удалось открыть окно входа. Попробуйте ещё раз.';
const SESSION_CHECK_ERROR_MESSAGE =
  'Не удалось проверить сессию. Выполните вход.';
const SDO_MCP_NOT_FOUND_MESSAGE =
  'Компонент входа SDO MCP не найден. Переустановите приложение.';
const SDO_MCP_NOT_STARTED_MESSAGE = 'Компонент входа SDO MCP не запустился.';

export function unavailableMessage(
  error: SdoMcpUnavailableError,
  logPath: string | undefined,
): string {
  if (error.reason === 'not_found') {
    return SDO_MCP_NOT_FOUND_MESSAGE;
  }
  return logPath
    ? `${SDO_MCP_NOT_STARTED_MESSAGE} Подробности в журнале: ${logPath}.`
    : `${SDO_MCP_NOT_STARTED_MESSAGE} Подробности в журнале приложения.`;
}

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
    } catch (error) {
      this.setState(this.failureState(error, LOGIN_ERROR_MESSAGE));
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
    } catch (error) {
      this.setState(this.failureState(error, MANUAL_SSO_ERROR_MESSAGE));
    } finally {
      this.busy = false;
    }
    return this.state;
  }

  async checkSession(): Promise<OnboardingState> {
    // A thrown error here means the session *could not be verified* (for
    // example, the SDO MCP server is missing or unreachable), not that the
    // session expired. Either way the safe next step is the login form, so we
    // never let the failure escape as an unhandled IPC rejection.
    try {
      const valid = await this.deps.checkSession();
      this.setState(
        valid ? { phase: 'session_ready' } : { phase: 'credentials' },
      );
    } catch (error) {
      this.setState(this.failureState(error, SESSION_CHECK_ERROR_MESSAGE));
    }
    return this.state;
  }

  /** The stored session stopped working: go back to the login form. */
  requireLogin(message: string): void {
    this.setState({ phase: 'credentials', error: message });
  }

  /**
   * SDO MCP failing to start is not a login problem: show why instead of the
   * login form. Any other failure returns to the form with `fallback`.
   */
  private failureState(error: unknown, fallback: string): OnboardingState {
    this.deps.onError?.(error);
    if (isSdoMcpUnavailableError(error)) {
      return {
        phase: 'failed',
        message: unavailableMessage(error, this.deps.logPath),
      };
    }
    return { phase: 'credentials', error: fallback };
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
