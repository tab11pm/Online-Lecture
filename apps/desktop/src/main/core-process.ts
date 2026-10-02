import { utilityProcess, type UtilityProcess } from 'electron';
import type { CoreStatus, LoginInput } from '../shared/ipc-contract.js';
import type { HostEvent, MainCommand } from '../shared/host-protocol.js';
import type { LoginOutcome, OnboardingState } from '../shared/onboarding.js';

const REQUEST_TIMEOUT_MS = 120_000;

export interface CoreProcessCallbacks {
  onChanged(state: OnboardingState): void;
  onStatusChanged(status: CoreStatus): void;
  onNotification(message: string): void;
}

export interface CoreProcessOptions {
  entryPath: string;
  userDataDir: string;
}

interface Pending<T> {
  resolve(value: T): void;
  reject(error: Error): void;
}

export class CoreProcess {
  private child: UtilityProcess | undefined;
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
    const child = utilityProcess.fork(this.options.entryPath, [
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
        this.callbacks.onNotification('Процесс ядра неожиданно завершился.');
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
    return new Promise<OnboardingState>((resolve, reject) => {
      this.pendingState = this.track(resolve, reject);
      this.post(command);
    });
  }

  private requestLogin(command: MainCommand): Promise<LoginOutcome> {
    return new Promise<LoginOutcome>((resolve, reject) => {
      this.pendingLogin = this.track(resolve, reject);
      this.post(command);
    });
  }

  private track<T>(
    resolve: (value: T) => void,
    reject: (error: Error) => void,
  ): Pending<T> {
    const timer = setTimeout(() => {
      reject(new Error('Истекло время ожидания ответа ядра.'));
    }, REQUEST_TIMEOUT_MS);
    return {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    };
  }

  private post(command: MainCommand): void {
    this.child?.postMessage(command);
  }

  private handleEvent(event: HostEvent): void {
    switch (event.type) {
      case 'onboarding.changed': {
        this.lastState = event.state;
        this.callbacks.onChanged(event.state);
        const pending = this.pendingState;
        this.pendingState = undefined;
        pending?.resolve(event.state);
        return;
      }
      case 'onboarding.loginResult': {
        const pending = this.pendingLogin;
        this.pendingLogin = undefined;
        pending?.resolve(event.outcome);
        return;
      }
      case 'host.error':
        this.callbacks.onNotification(event.message);
        this.rejectPending(event.message);
        return;
    }
  }

  private rejectPending(message: string): void {
    const statePending = this.pendingState;
    this.pendingState = undefined;
    statePending?.reject(new Error(message));
    const loginPending = this.pendingLogin;
    this.pendingLogin = undefined;
    loginPending?.reject(new Error(message));
  }

  private setStatus(status: CoreStatus): void {
    this.status = status;
    this.callbacks.onStatusChanged(status);
  }
}
