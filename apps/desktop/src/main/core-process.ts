import type {
  CoreStatus,
  LoginInput,
  CoreNotification,
} from '../shared/ipc-contract.js';
import type { HostEvent, MainCommand } from '../shared/host-protocol.js';
import type { LoginOutcome, OnboardingState } from '../shared/onboarding.js';
import type { LecturesView } from '../shared/lectures.js';
import type { BrowserChoice } from '../shared/browser-choice.js';
import type { RuntimeMode } from '../shared/runtime-mode.js';
import { encodeWorkerStartup } from '../shared/worker-startup.js';
import type {
  EditImportedTimeInput,
  ManualScheduleInput,
  RescheduleInput,
} from '@core/core/schedule-editing.js';
import type { ManualTargetLookup } from '../shared/lectures.js';
import type {
  JournalFilter,
  JournalPage,
  NewJournalEvent,
} from '../shared/journal.js';
import { randomUUID } from 'node:crypto';
import { redactSensitiveText } from '@core/core/redaction.js';

export const REQUEST_TIMEOUT_MS = 120_000;
export const LECTURE_MUTATION_TIMEOUT_MS = 30_000;

// Manual SSO can take up to the provider's five-minute poll window, which
// exceeds the normal RPC timeout. Exempt it from the bridge timeout and rely
// on `onboarding.changed` push events (and the worker's own poll deadline)
// instead; 0 disables the timer.
export const MANUAL_SSO_REQUEST_TIMEOUT_MS = 0;

const REQUEST_TIMEOUT_MESSAGE = 'Истекло время ожидания ответа ядра.';

export interface CoreProcessCallbacks {
  onChanged(state: OnboardingState): void;
  onStatusChanged(status: CoreStatus): void;
  onNotification(notification: CoreNotification): void;
  onLecturesChanged(view: LecturesView): void;
  onJournalEvent?(event: NewJournalEvent): void;
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
  initialBrowserChoice?: BrowserChoice;
  initialShowLectureWindow: boolean;
  externalChannel?: string;
  runtimeMode?: RuntimeMode;
  fork(entryPath: string, args: string[]): CoreChild;
}

interface Pending<T> {
  resolve(value: T): void;
  reject(error: Error): void;
}

type LectureCommand =
  Extract<MainCommand, { requestId: string }> extends infer Command
    ? Command extends { requestId: string }
      ? Omit<Command, 'requestId'>
      : never
    : never;

type StateCommand = Extract<
  MainCommand,
  { type: 'onboarding.getState' | 'onboarding.checkSession' }
>;

const EMPTY_LECTURES_VIEW: LecturesView = {
  agenda: [],
  import: { status: 'idle' },
};

export class CoreProcess {
  private child: CoreChild | undefined;
  private status: CoreStatus = 'idle';
  private ready = false;
  private readonly queued: MainCommand[] = [];
  private lastState: OnboardingState = { phase: 'welcome' };
  private pendingState: Pending<OnboardingState> | undefined;
  private pendingLogin: Pending<LoginOutcome> | undefined;
  private readonly pendingLectures = new Map<string, Pending<unknown>>();
  private readonly pendingJournal = new Map<string, Pending<JournalPage>>();
  private lecturesView: LecturesView = EMPTY_LECTURES_VIEW;
  private shutdownWaiter: (() => void) | undefined;
  private stateRequest: Promise<OnboardingState> | undefined;
  private readonly stateRequests = new Map<
    StateCommand['type'],
    Promise<OnboardingState>
  >();
  private loginRequest: Promise<LoginOutcome> | undefined;

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
    this.ready = false;
    if (this.options.initialBrowserChoice) {
      this.queued.unshift({
        type: 'browser.setChoice',
        choice: this.options.initialBrowserChoice,
      });
    }
    this.queued.unshift({
      type: 'lectures.setShowWindow',
      show: this.options.initialShowLectureWindow,
    });
    const child = this.options.fork(
      this.options.entryPath,
      encodeWorkerStartup({
        userDataDir: this.options.userDataDir,
        ...(this.options.externalChannel === undefined
          ? {}
          : { externalChannel: this.options.externalChannel }),
        runtimeMode: this.options.runtimeMode ?? 'development',
      }),
    );
    this.child = child;
    child.on('message', (message) => {
      this.handleEvent(message as HostEvent);
    });
    child.on('exit', () => {
      this.child = undefined;
      this.ready = false;
      this.queued.length = 0;
      this.rejectPending('Процесс ядра неожиданно завершился.');
      this.lecturesView = EMPTY_LECTURES_VIEW;
      this.callbacks.onLecturesChanged(EMPTY_LECTURES_VIEW);
      this.shutdownWaiter?.();
      if (this.status !== 'stopped') {
        this.setStatus('error');
        this.callbacks.onNotification({
          level: 'error',
          message: 'Процесс ядра неожиданно завершился.',
        });
      }
    });
    // Status becomes `running` only once the worker confirms `host.ready`.
    return this.status;
  }

  stop(): CoreStatus {
    const child = this.child;
    this.child = undefined;
    this.ready = false;
    this.queued.length = 0;
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
    return this.requestLogin(
      { type: 'onboarding.login', input },
      REQUEST_TIMEOUT_MS,
    );
  }

  openManualSso(): Promise<LoginOutcome> {
    this.ensureStarted();
    return this.requestLogin(
      { type: 'onboarding.openManualSso' },
      MANUAL_SSO_REQUEST_TIMEOUT_MS,
    );
  }

  setBrowserChoice(choice: BrowserChoice): void {
    this.options.initialBrowserChoice = choice;
    this.ensureStarted();
    this.post({ type: 'browser.setChoice', choice });
  }

  getLecturesView(): LecturesView {
    return this.lecturesView;
  }

  listJournalPage(
    filter: JournalFilter,
    cursor?: string,
  ): Promise<JournalPage> {
    this.ensureStarted();
    const requestId = randomUUID();
    return new Promise<JournalPage>((resolve, reject) => {
      const pending = this.createPending(
        resolve,
        reject,
        () => this.pendingJournal.delete(requestId),
        LECTURE_MUTATION_TIMEOUT_MS,
      );
      this.pendingJournal.set(requestId, pending);
      this.post({
        type: 'journal.list',
        requestId,
        filter,
        ...(cursor ? { cursor } : {}),
      });
    });
  }

  importLectures(): void {
    this.ensureStarted();
    this.post({ type: 'lectures.import' });
  }

  stopCurrentLecture(): void {
    this.ensureStarted();
    this.post({ type: 'lectures.stopCurrent' });
  }

  setLectureSkipped(
    jobId: string,
    occurrenceId: string,
    skipped: boolean,
  ): void {
    this.ensureStarted();
    this.post({ type: 'lectures.setSkipped', jobId, occurrenceId, skipped });
  }

  resolveManualTarget(query: string): Promise<ManualTargetLookup> {
    return this.requestLecture<ManualTargetLookup>(
      { type: 'lectures.resolveManualTarget', query },
      REQUEST_TIMEOUT_MS,
    );
  }

  saveManual(input: {
    candidateId: string;
    title: string;
    schedule: ManualScheduleInput;
  }): Promise<void> {
    return this.requestLecture<void>(
      { type: 'lectures.saveManual', input },
      LECTURE_MUTATION_TIMEOUT_MS,
    );
  }

  editImportedTime(input: EditImportedTimeInput): Promise<void> {
    return this.requestLecture<void>(
      { type: 'lectures.editImportedTime', input },
      LECTURE_MUTATION_TIMEOUT_MS,
    );
  }

  reschedule(input: RescheduleInput): Promise<string> {
    return this.requestLecture<string>(
      { type: 'lectures.reschedule', input },
      LECTURE_MUTATION_TIMEOUT_MS,
    );
  }

  cancelReschedule(jobId: string): Promise<void> {
    return this.requestLecture<void>(
      { type: 'lectures.cancelReschedule', jobId },
      LECTURE_MUTATION_TIMEOUT_MS,
    );
  }

  deleteLecture(jobId: string, occurrenceId?: string): Promise<void> {
    return this.requestLecture<void>(
      {
        type: 'lectures.deleteLecture',
        jobId,
        ...(occurrenceId ? { occurrenceId } : {}),
      },
      LECTURE_MUTATION_TIMEOUT_MS,
    );
  }

  private requestLecture<T>(
    command: LectureCommand,
    timeoutMs: number,
  ): Promise<T> {
    this.ensureStarted();
    const requestId = randomUUID();
    return new Promise<T>((resolve, reject) => {
      const pending = this.createPending<T>(
        resolve,
        reject,
        () => this.pendingLectures.delete(requestId),
        timeoutMs,
      );
      this.pendingLectures.set(requestId, pending as Pending<unknown>);
      this.post({ ...command, requestId } as MainCommand);
    });
  }

  setShowLectureWindow(show: boolean): void {
    this.options.initialShowLectureWindow = show;
    this.ensureStarted();
    this.post({ type: 'lectures.setShowWindow', show });
  }

  systemResumed(): void {
    if (this.child) {
      this.post({ type: 'system.resumed' });
    }
  }

  async shutdown(timeoutMs: number): Promise<void> {
    if (this.child && this.ready) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, timeoutMs);
        const waiter = done;
        this.shutdownWaiter = waiter;
        function done(): void {
          clearTimeout(timer);
          resolve();
        }
        this.child?.postMessage({ type: 'app.shutdown' } satisfies MainCommand);
      });
      this.shutdownWaiter = undefined;
    }
    this.stop();
  }

  private ensureStarted(): void {
    if (!this.child) {
      this.start();
    }
  }

  private requestState(command: StateCommand): Promise<OnboardingState> {
    const sameCommand = this.stateRequests.get(command.type);
    if (sameCommand) return sameCommand;

    // State results carry no request ID, so two different onboarding
    // operations must not overlap: the earlier operation's event could
    // otherwise settle the later operation. Keep each operation's meaning
    // while serializing them behind the current request.
    const previous = this.stateRequest;
    const promise = previous
      ? previous.then(() => this.sendStateRequest(command))
      : this.sendStateRequest(command);
    this.stateRequest = promise;
    this.stateRequests.set(command.type, promise);
    const clearRequest = (): void => {
      if (this.stateRequests.get(command.type) === promise) {
        this.stateRequests.delete(command.type);
      }
      if (this.stateRequest === promise) {
        this.stateRequest = undefined;
      }
    };
    void promise.then(clearRequest, clearRequest);
    return promise;
  }

  private sendStateRequest(command: StateCommand): Promise<OnboardingState> {
    let resolve!: (value: OnboardingState) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<OnboardingState>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const pending = this.createPending(
      resolve,
      reject,
      () => {
        if (this.pendingState === pending) {
          this.pendingState = undefined;
        }
      },
      REQUEST_TIMEOUT_MS,
    );
    this.pendingState = pending;
    this.post(command);
    return promise;
  }

  private requestLogin(
    command: MainCommand,
    timeoutMs: number,
  ): Promise<LoginOutcome> {
    if (this.loginRequest) {
      return this.loginRequest;
    }
    let resolve!: (value: LoginOutcome) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<LoginOutcome>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const pending = this.createPending(
      resolve,
      reject,
      () => {
        if (this.pendingLogin === pending) {
          this.pendingLogin = undefined;
        }
        if (this.loginRequest === promise) {
          this.loginRequest = undefined;
        }
      },
      timeoutMs,
    );
    this.pendingLogin = pending;
    this.loginRequest = promise;
    this.post(command);
    return promise;
  }

  private createPending<T>(
    resolve: (value: T) => void,
    reject: (error: Error) => void,
    clear: () => void,
    timeoutMs: number,
  ): Pending<T> {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        clear();
        reject(new Error(REQUEST_TIMEOUT_MESSAGE));
      }, timeoutMs);
    }
    const settle = (): boolean => {
      if (settled) {
        return false;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
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
    if (!this.ready) {
      this.queued.push(command);
      return;
    }
    this.child?.postMessage(command);
  }

  private flushQueue(): void {
    const commands = this.queued.splice(0, this.queued.length);
    for (const command of commands) {
      this.child?.postMessage(command);
    }
  }

  private handleEvent(event: HostEvent): void {
    switch (event.type) {
      case 'host.ready':
        this.ready = true;
        this.setStatus('running');
        this.flushQueue();
        return;
      case 'onboarding.changed':
        this.lastState = event.state;
        this.callbacks.onChanged(event.state);
        return;
      case 'onboarding.stateResult':
        if (this.pendingState) {
          this.lastState = event.state;
          this.pendingState.resolve(event.state);
        }
        return;
      case 'lectures.changed':
        this.lecturesView = event.view;
        this.callbacks.onLecturesChanged(event.view);
        return;
      case 'journal.result': {
        const pending = this.pendingJournal.get(event.requestId);
        if (event.ok) pending?.resolve(event.page);
        else pending?.reject(new Error(redactSensitiveText(event.message)));
        return;
      }
      case 'journal.event':
        this.callbacks.onJournalEvent?.(event.event);
        return;
      case 'lectures.commandResult': {
        const pending = this.pendingLectures.get(event.requestId);
        if (event.ok) pending?.resolve(event.value);
        else pending?.reject(new Error(redactSensitiveText(event.message)));
        return;
      }
      case 'host.shutdownComplete':
        this.shutdownWaiter?.();
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
    for (const pending of this.pendingLectures.values())
      pending.reject(new Error(message));
    for (const pending of this.pendingJournal.values())
      pending.reject(new Error(message));
  }

  private setStatus(status: CoreStatus): void {
    this.status = status;
    this.callbacks.onStatusChanged(status);
  }
}
