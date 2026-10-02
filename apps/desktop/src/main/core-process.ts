import type {
  CoreStatus,
  LoginInput,
  CoreNotification,
} from '../shared/ipc-contract.js';
import type { HostEvent, MainCommand } from '../shared/host-protocol.js';
import type { LoginOutcome, OnboardingState } from '../shared/onboarding.js';

export const REQUEST_TIMEOUT_MS = 120_000;
const REQUEST_IN_FLIGHT_MESSAGE =
  'Предыдущий запрос ещё выполняется. Дождитесь ответа.';
const REQUEST_TIMEOUT_MESSAGE = 'Истекло время ожидания ответа ядра.';

export interface CoreProcessCallbacks {
  onChanged(state: OnboardingState): void;
  onStatusChanged(status: CoreStatus): void;
  onNotification(notification: CoreNotification): void;
}

/**
 * Minimal structural view of the Electron `UtilityProcess` used by this bridge.
 * Kept free of any Electron import so the bridge can be unit-tested with a fake
 * child; the real `UtilityProcess` satisfies this shape.
 */
export interface CoreChild {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  postMessage(message: unknown): void;
  kill(): boolean;
}

export interface CoreProcessOptions {
  entryPath: string;
  userDataDir: string;
  fork(entryPath: string, args: string[]): CoreChild;
}

interface Pending<T> {
  resolve(value: T): void;
  reject(error: Error): void;
}

export class CoreProcess {
  private child: CoreChild | undefined;
  private status: CoreStatus = 'idle';
  private lastState: OnboardingState = { phase: 'welcome' };
  private pendingState: Pending<OnboardingState> | undefined;
  private pendingLogin: Pending<LoginOutcome> | undefined;

  constructor(
    private readonly options: CoreProcessOptions,
    private readonly callbacks: CoreProcessCallbacks,
  ) {}

  getStatus(): CoreStatus {
    return this.status;
  }

  getLastState(): OnboardingState {
    return this.lastState;
  }

  start(): CoreStatus {
    if (this.child) {
      return this.status;
    }
    this.setStatus('starting');
    const child = this.options.fork(this.options.entryPath, [
      this.options.userDataDir,
    ]);
    this.child = child;
    child.on('message', (message) => {
      this.handleEvent(message as HostEvent);
    });
    child.on('exit', () => {
      this.child = undefined;
      this.rejectPending('Процесс ядра неожиданно завершился.');
      if (this.status !== 'stopped') {
        this.setStatus('error');
        this.callbacks.onNotification({
          level: 'error',
          message: 'Процесс ядра неожиданно завершился.',
        });
      }
    });
    this.setStatus('running');
    return this.status;
  }

  stop(): CoreStatus {
    const child = this.child;
    this.child = undefined;
    this.rejectPending('Процесс ядра остановлен.');
    this.setStatus('stopped');
    child?.kill();
    return this.status;
  }

  getState(): Promise<OnboardingState> {
    this.ensureStarted();
    return this.requestState({ type: 'onboarding.getState' });
  }

  checkSession(): Promise<OnboardingState> {
    this.ensureStarted();
    return this.requestState({ type: 'onboarding.checkSession' });
  }

  login(input: LoginInput): Promise<LoginOutcome> {
    this.ensureStarted();
    return this.requestLogin({ type: 'onboarding.login', input });
  }

  openManualSso(): Promise<LoginOutcome> {
    this.ensureStarted();
    return this.requestLogin({ type: 'onboarding.openManualSso' });
  }

  private ensureStarted(): void {
    if (!this.child) {
      this.start();
    }
  }

  private requestState(command: MainCommand): Promise<OnboardingState> {
    if (this.pendingState) {
      return Promise.reject(new Error(REQUEST_IN_FLIGHT_MESSAGE));
    }
    return new Promise<OnboardingState>((resolve, reject) => {
      const pending = this.createPending(resolve, reject, () => {
        if (this.pendingState === pending) {
          this.pendingState = undefined;
        }
      });
      this.pendingState = pending;
      this.post(command);
    });
  }

  private requestLogin(command: MainCommand): Promise<LoginOutcome> {
    if (this.pendingLogin) {
      return Promise.reject(new Error(REQUEST_IN_FLIGHT_MESSAGE));
    }
    return new Promise<LoginOutcome>((resolve, reject) => {
      const pending = this.createPending(resolve, reject, () => {
        if (this.pendingLogin === pending) {
          this.pendingLogin = undefined;
        }
      });
      this.pendingLogin = pending;
      this.post(command);
    });
  }

  private createPending<T>(
    resolve: (value: T) => void,
    reject: (error: Error) => void,
    clear: () => void,
  ): Pending<T> {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      clear();
      reject(new Error(REQUEST_TIMEOUT_MESSAGE));
    }, REQUEST_TIMEOUT_MS);
    const settle = (): boolean => {
      if (settled) {
        return false;
      }
      settled = true;
      clearTimeout(timer);
      clear();
      return true;
    };
    return {
      resolve: (value) => {
        if (settle()) {
          resolve(value);
        }
      },
      reject: (error) => {
        if (settle()) {
          reject(error);
        }
      },
    };
  }

  private post(command: MainCommand): void {
    this.child?.postMessage(command);
  }

  private handleEvent(event: HostEvent): void {
    switch (event.type) {
      case 'onboarding.changed':
        this.lastState = event.state;
        this.callbacks.onChanged(event.state);
        this.pendingState?.resolve(event.state);
        return;
      case 'onboarding.loginResult':
        this.pendingLogin?.resolve(event.outcome);
        return;
      case 'host.error':
        this.callbacks.onNotification({
          level: 'error',
          message: event.message,
        });
        this.pendingState?.reject(new Error(event.message));
        this.pendingLogin?.reject(new Error(event.message));
        return;
    }
  }

  private rejectPending(message: string): void {
    this.pendingState?.reject(new Error(message));
    this.pendingLogin?.reject(new Error(message));
  }

  private setStatus(status: CoreStatus): void {
    this.status = status;
    this.callbacks.onStatusChanged(status);
  }
}
