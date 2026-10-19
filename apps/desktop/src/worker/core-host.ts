import { isSdoMcpUnavailableError } from '@core/core/mcp-errors.js';
import { randomUUID } from 'node:crypto';
import type { JournalCode } from '@core/persistence/desktop-event-repository.js';
import { redactSensitiveText } from '@core/core/redaction.js';
import { browserChannel } from '../shared/browser-choice.js';
import type { HostEvent, MainCommand } from '../shared/host-protocol.js';
import type { NewJournalEvent } from '../shared/journal.js';
import type {
  LectureBrowserOptions,
  LecturesView,
} from '../shared/lectures.js';
import type { LoginOutcome, OnboardingState } from '../shared/onboarding.js';
import type { AppPaths } from '../shared/paths.js';
import type { CoreLog } from './core-log.js';
import type { LectureService } from './lecture-service.js';
import { OnboardingMachine } from './onboarding-machine.js';
import { SdoMcpSessionProvider } from './sdo-mcp-session-provider.js';
import type { SessionProvider } from './session-provider.js';

export interface HostTransport {
  post(event: HostEvent): void;
  onMessage(handler: (command: MainCommand) => void): void;
}

export type LectureControl = Pick<
  LectureService,
  | 'open'
  | 'activate'
  | 'deactivate'
  | 'getView'
  | 'importNow'
  | 'stopCurrent'
  | 'setSkipped'
  | 'resolveManualTarget'
  | 'saveManual'
  | 'editImportedTime'
  | 'reschedule'
  | 'cancelReschedule'
  | 'deleteLecture'
  | 'recordSystemEvent'
  | 'listJournalPage'
  | 'setBrowser'
  | 'resumed'
  | 'shutdown'
>;

export interface LectureHostEvents {
  onView(view: LecturesView): void;
  onAuthRequired(): void;
  onJournalEvent(event: NewJournalEvent): void;
}

export interface CoreHostDependencies {
  paths: AppPaths;
  machine?: OnboardingMachine;
  provider?: SessionProvider;
  log?: CoreLog;
  /** Builds the lecture service with callbacks that reach this host. */
  lectures?(events: LectureHostEvents): LectureControl;
}

const SESSION_EXPIRED_MESSAGE = 'Сессия ТУСУР истекла. Войдите снова.';
const SHUTDOWN_TIMEOUT_MS = 10_000;

export class CoreHost {
  private readonly paths: AppPaths;
  private readonly machine: OnboardingMachine;
  private readonly log: CoreLog | undefined;
  private readonly provider: SessionProvider | undefined;
  private capturedOutcome: LoginOutcome | undefined;
  private unsubscribe: (() => void) | undefined;
  private started = false;
  private readonly lectures: LectureControl | undefined;
  /** Resolves to whether the lecture database opened; activation waits for it. */
  private lecturesReady: Promise<boolean> = Promise.resolve(false);
  private sessionReady = false;
  private loginInFlight = false;
  private browser: LectureBrowserOptions = { headless: false };
  private authEpisode = false;

  constructor(
    private readonly transport: HostTransport,
    deps: CoreHostDependencies,
  ) {
    this.paths = deps.paths;
    this.log = deps.log;
    this.provider = deps.provider;
    this.machine = deps.machine ?? this.buildMachine(deps.provider);
    this.lectures = deps.lectures?.({
      onView: (view) => this.transport.post({ type: 'lectures.changed', view }),
      onAuthRequired: () => {
        this.machine.requireLogin(SESSION_EXPIRED_MESSAGE);
        if (!this.authEpisode) {
          this.authEpisode = true;
          void this.recordEvent('auth_required', `auth:${randomUUID()}`);
        }
      },
      onJournalEvent: (event) =>
        this.transport.post({ type: 'journal.event', event }),
    });
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.unsubscribe = this.machine.onChange((state) => {
      this.followSession(state);
      this.postChanged(state);
    });
    this.lecturesReady = this.openLectures();
    this.transport.onMessage((command) => {
      void this.handle(command);
    });
    // Handshake: the transport is wired and can accept commands, so tell the
    // host it is safe to flush anything it queued before this point.
    this.transport.post({ type: 'host.ready' });
    this.machine.start();
  }

  async stop(): Promise<void> {
    this.started = false;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  private async openLectures(): Promise<boolean> {
    if (!this.lectures) return false;
    try {
      await this.lectures.open();
      return true;
    } catch (error) {
      this.log?.error(
        `lectures open failed: ${redactSensitiveText(errorMessage(error))}`,
      );
      this.transport.post({
        type: 'host.error',
        message: localizeHostError(redactSensitiveText(errorMessage(error))),
      });
      return false;
    }
  }

  /** Lectures run only while the session is ready. */
  private followSession(state: OnboardingState): void {
    const ready = state.phase === 'session_ready';
    if (ready === this.sessionReady) return;
    this.sessionReady = ready;
    const trigger = this.loginInFlight ? 'login' : 'startup';
    void this.lecturesReady.then((opened) => {
      if (!opened || !this.lectures) return;
      if (ready) this.lectures.activate(trigger);
      else this.lectures.deactivate();
    });
  }

  private setBrowser(next: LectureBrowserOptions): void {
    this.browser = next;
    this.lectures?.setBrowser(next);
  }

  private buildMachine(provider?: SessionProvider): OnboardingMachine {
    const session = provider ?? new SdoMcpSessionProvider();
    return new OnboardingMachine({
      login: async (input) => {
        const outcome = await session.loginWithCredentials({
          ...input,
          authStatePath: this.paths.authState,
        });
        this.capturedOutcome = outcome;
        return outcome;
      },
      openManualSso: async () => {
        const outcome = await session.openManualLogin(this.paths.authState);
        this.capturedOutcome = outcome;
        return outcome;
      },
      checkSession: () => session.checkSession(this.paths.authState),
      ...(this.log ? { logPath: this.log.path } : {}),
      onError: (error) => this.logError(error),
    });
  }

  private logError(error: unknown): void {
    void this.recordEvent('core_error', `onboarding:${randomUUID()}`);
    if (!this.log) {
      return;
    }
    if (isSdoMcpUnavailableError(error)) {
      this.log.error(
        `sdo-mcp unavailable reason=${error.reason} source=${error.source ?? 'unknown'}\n${error.detail}`,
      );
      return;
    }
    this.log.error(`onboarding error: ${errorMessage(error)}`);
  }

  private async handle(command: MainCommand): Promise<void> {
    if (!this.started) {
      return;
    }
    try {
      switch (command.type) {
        case 'journal.list':
          await this.handleJournalRequest(command);
          return;
        case 'lectures.resolveManualTarget':
        case 'lectures.saveManual':
        case 'lectures.editImportedTime':
        case 'lectures.reschedule':
        case 'lectures.cancelReschedule':
        case 'lectures.deleteLecture':
          await this.handleLectureCommand(command);
          return;
        case 'browser.setChoice': {
          this.provider?.setBrowserChoice?.(command.choice);
          const channel = browserChannel(command.choice);
          this.setBrowser({
            ...(channel ? { channel } : {}),
            headless: this.browser.headless,
          });
          return;
        }
        case 'lectures.setShowWindow':
          this.setBrowser({
            ...(this.browser.channel ? { channel: this.browser.channel } : {}),
            headless: !command.show,
          });
          return;
        case 'lectures.getView':
          if (this.lectures) {
            this.transport.post({
              type: 'lectures.changed',
              view: this.lectures.getView(),
            });
          }
          return;
        case 'lectures.import':
          await this.lectures?.importNow();
          return;
        case 'lectures.stopCurrent':
          await this.lectures?.stopCurrent();
          return;
        case 'lectures.setSkipped':
          await this.lectures?.setSkipped(
            command.jobId,
            command.occurrenceId,
            command.skipped,
          );
          return;
        case 'system.resumed':
          this.lectures?.resumed();
          return;
        case 'app.shutdown':
          try {
            await this.lectures?.shutdown(SHUTDOWN_TIMEOUT_MS);
          } finally {
            this.transport.post({ type: 'host.shutdownComplete' });
          }
          return;
        case 'onboarding.getState':
          this.postChanged(this.machine.getState());
          return;
        case 'onboarding.login':
          await this.postOutcome(
            await this.whileLoggingIn(() =>
              this.machine.submitCredentials(command.input),
            ),
          );
          return;
        case 'onboarding.openManualSso':
          await this.postOutcome(
            await this.whileLoggingIn(() => this.machine.openManualSso()),
          );
          return;
        case 'onboarding.checkSession':
          this.postChanged(await this.machine.checkSession());
          return;
        default:
          return;
      }
    } catch (error) {
      await this.recordEvent('core_error', `host:${randomUUID()}`);
      this.transport.post({
        type: 'host.error',
        message: localizeHostError(redactSensitiveText(errorMessage(error))),
      });
    }
  }

  private async handleJournalRequest(
    command: Extract<MainCommand, { type: 'journal.list' }>,
  ): Promise<void> {
    try {
      if (command.filter !== 'all' && command.filter !== 'errors')
        throw new Error('Invalid journal filter');
      if (
        command.cursor !== undefined &&
        (typeof command.cursor !== 'string' ||
          command.cursor.length === 0 ||
          command.cursor.length > 512)
      )
        throw new Error('Invalid journal cursor');
      if (!(await this.lecturesReady) || !this.lectures)
        throw new Error('Lecture database is not open');
      const page = await this.lectures.listJournalPage(
        command.filter,
        command.cursor,
      );
      this.transport.post({
        type: 'journal.result',
        requestId: command.requestId,
        ok: true,
        page,
      });
    } catch (error) {
      this.log?.error(
        `journal read failed: ${redactSensitiveText(errorMessage(error))}`,
      );
      this.transport.post({
        type: 'journal.result',
        requestId: command.requestId,
        ok: false,
        message: 'Не удалось открыть журнал.',
      });
    }
  }

  private async handleLectureCommand(
    command: Extract<MainCommand, { requestId: string }>,
  ): Promise<void> {
    try {
      if (!this.sessionReady || !(await this.lecturesReady) || !this.lectures)
        throw new Error(SESSION_EXPIRED_MESSAGE);
      let value: unknown;
      switch (command.type) {
        case 'lectures.resolveManualTarget':
          value = await this.lectures.resolveManualTarget(command.query);
          break;
        case 'lectures.saveManual':
          await this.lectures.saveManual(command.input);
          break;
        case 'lectures.editImportedTime':
          await this.lectures.editImportedTime(command.input);
          break;
        case 'lectures.reschedule':
          value = await this.lectures.reschedule(command.input);
          break;
        case 'lectures.cancelReschedule':
          await this.lectures.cancelReschedule(command.jobId);
          break;
        case 'lectures.deleteLecture':
          await this.lectures.deleteLecture(
            command.jobId,
            command.occurrenceId,
          );
          break;
      }
      this.transport.post({
        type: 'lectures.commandResult',
        requestId: command.requestId,
        ok: true,
        value,
      });
    } catch (error) {
      this.transport.post({
        type: 'lectures.commandResult',
        requestId: command.requestId,
        ok: false,
        message: localizeHostError(redactSensitiveText(errorMessage(error))),
      });
    }
  }

  private async whileLoggingIn(
    action: () => Promise<OnboardingState>,
  ): Promise<OnboardingState> {
    this.loginInFlight = true;
    try {
      return await action();
    } finally {
      this.loginInFlight = false;
    }
  }

  private postChanged(state: OnboardingState): void {
    this.transport.post({ type: 'onboarding.changed', state });
  }

  private async postOutcome(state: OnboardingState): Promise<void> {
    const outcome = this.capturedOutcome ?? outcomeFromState(state);
    this.capturedOutcome = undefined;
    this.transport.post({ type: 'onboarding.loginResult', outcome });
    if (state.phase === 'session_ready' && outcome.ok) {
      this.authEpisode = false;
      await this.recordEvent('login_succeeded', `login:${randomUUID()}`);
    }
  }

  private async recordEvent(code: JournalCode, key: string): Promise<void> {
    if (!(await this.lecturesReady) || !this.lectures) return;
    try {
      await this.lectures.recordSystemEvent(code, key);
    } catch (error) {
      this.log?.error(
        `journal event failed: ${redactSensitiveText(errorMessage(error))}`,
      );
    }
  }
}

function outcomeFromState(state: OnboardingState): LoginOutcome {
  switch (state.phase) {
    case 'session_ready':
      return { ok: true };
    case 'manual_sso':
      return { ok: false, reason: 'captcha' };
    case 'credentials':
      return state.error
        ? { ok: false, reason: 'invalid', message: state.error }
        : { ok: false, reason: 'invalid' };
    case 'failed':
      return { ok: false, reason: 'error', message: state.message };
    default:
      return { ok: false, reason: 'error' };
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : 'Не удалось выполнить операцию.';
}

const HOST_ERROR_TRANSLATIONS: ReadonlyArray<readonly [string, string]> = [
  [
    'Lecture database is not open',
    'База лекций недоступна. Перезапустите приложение.',
  ],
  ['Lecture not found', 'Пара не найдена. Обновите расписание.'],
  ['Occurrence not found', 'Пара не найдена. Обновите расписание.'],
  ['Lecture slot is already occupied', 'На это время уже есть такая пара.'],
  ['Select a confirmed SDO activity', 'Сначала выберите активность BBB.'],
  ['Enter a lecture title', 'Введите название пары.'],
  ['Lecture entry must be in the future', 'Время входа должно быть в будущем.'],
  ['Lecture entry has already started', 'Пара уже началась.'],
  ['Lecture exit must be after entry', 'Время выхода должно быть позже входа.'],
  ['Invalid lecture date or time', 'Проверьте дату и время пары.'],
];

/** Translates the worker's known internal English errors for the UI. */
function localizeHostError(message: string): string {
  for (const [english, russian] of HOST_ERROR_TRANSLATIONS) {
    if (message === english) return russian;
  }
  return message;
}
