import type { TimetableImportResult } from '@core/timetable/import-service.js';
import type { ImportStage, ImportView } from '../shared/lectures.js';

export const DAY_MS = 86_400_000;
export const RETRY_MS = 3_600_000;

export type ImportTrigger = 'login' | 'startup' | 'daily' | 'manual' | 'retry';

export interface ImportSchedulerDependencies {
  runImport(
    onProgress: (stage: ImportStage) => void,
  ): Promise<TimetableImportResult>;
  isLectureActive(): boolean;
  lastSuccessAt(): Date | undefined;
  now(): Date;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
  onView(view: ImportView): void;
  onAuthRequired(): void;
}

const AUTH_MESSAGE = 'Сессия ТУСУР истекла. Войдите снова.';
const GENERIC_MESSAGE = 'Не удалось обновить расписание.';

export class ImportScheduler {
  private current: ImportView;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;
  private deferred = false;
  private stopped = false;

  constructor(private readonly deps: ImportSchedulerDependencies) {
    this.current = { status: 'idle', ...this.lastSuccess() };
  }

  get view(): ImportView {
    return this.current;
  }

  start(trigger: 'login' | 'startup'): void {
    this.stopped = false;
    if (trigger === 'startup') {
      const last = this.deps.lastSuccessAt();
      if (last) {
        const age = this.deps.now().getTime() - last.getTime();
        if (age >= 0 && age < DAY_MS) {
          this.schedule(DAY_MS - age, 'daily');
          return;
        }
      }
    }
    void this.request(trigger);
  }

  request(trigger: ImportTrigger): Promise<void> {
    if (this.running) return this.running;
    if (trigger !== 'manual') {
      if (this.stopped) return Promise.resolve();
      if (this.deps.isLectureActive()) {
        this.deferred = true;
        return Promise.resolve();
      }
    }
    this.clearTimer();
    this.deferred = false;
    this.running = this.run().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  lectureFinished(): void {
    if (!this.deferred || this.stopped) return;
    void this.request('retry');
  }

  stop(): void {
    this.stopped = true;
    this.deferred = false;
    this.clearTimer();
  }

  private async run(): Promise<void> {
    this.emit({ status: 'running', stage: 'group', ...this.lastSuccess() });
    let result: TimetableImportResult;
    try {
      result = await this.deps.runImport((stage) =>
        this.emit({ status: 'running', stage, ...this.lastSuccess() }),
      );
    } catch {
      result = { status: 'failed', message: GENERIC_MESSAGE };
    }
    const at = this.deps.now().toISOString();
    if (result.status === 'completed') {
      const unresolved = [
        ...new Set([
          ...result.unresolved,
          ...result.ambiguous,
          ...result.unmapped,
        ]),
      ];
      this.emit({
        status: 'done',
        at,
        summary: {
          added: result.summary.added,
          removed: result.summary.removed,
          complete: result.complete,
        },
        unresolved,
      });
      this.schedule(DAY_MS, 'daily');
    } else if (result.status === 'auth_required') {
      this.emit({
        status: 'failed',
        at,
        message: AUTH_MESSAGE,
        ...this.lastSuccess(),
      });
      this.deps.onAuthRequired();
    } else {
      this.emit({
        status: 'failed',
        at,
        message: result.message,
        ...this.lastSuccess(),
      });
      this.schedule(RETRY_MS, 'retry');
    }
  }

  private schedule(ms: number, trigger: ImportTrigger): void {
    if (this.stopped) return;
    this.clearTimer();
    this.timer = (this.deps.setTimeout ?? setTimeout)(() => {
      this.timer = undefined;
      void this.request(trigger);
    }, ms);
  }

  private clearTimer(): void {
    if (this.timer === undefined) return;
    (this.deps.clearTimeout ?? clearTimeout)(this.timer);
    this.timer = undefined;
  }

  private lastSuccess(): { lastSuccessAt?: string } {
    const last = this.deps.lastSuccessAt();
    return last ? { lastSuccessAt: last.toISOString() } : {};
  }

  private emit(view: ImportView): void {
    this.current = view;
    this.deps.onView(view);
  }
}
