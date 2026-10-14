import type { RunResult } from '@core/core/job-runner.js';
import { buildAgenda, type AgendaEntry } from '@core/core/lecture-agenda.js';
import { setOccurrenceSuppressed } from '@core/core/occurrence-suppression.js';
import { redactSensitiveText } from '@core/core/redaction.js';
import { Scheduler } from '@core/core/scheduler.js';
import type { Job, Run } from '@core/core/types.js';
import { SqliteJobRepository } from '@core/persistence/job-repository.js';
import { SqliteMetaRepository } from '@core/persistence/meta-repository.js';
import { SqliteRunRepository } from '@core/persistence/run-repository.js';
import { SqliteStore } from '@core/persistence/sqlite-store.js';
import {
  LAST_IMPORT_KEY,
  type TimetableImportResult,
} from '@core/timetable/import-service.js';
import type {
  AgendaItem,
  ImportStage,
  LectureBrowserOptions,
  LecturesView,
} from '../shared/lectures.js';
import type { CoreLog } from './core-log.js';
import { ImportScheduler } from './import-scheduler.js';
import { SchedulerLoop } from './scheduler-loop.js';
import { SingleLectureRunner } from './single-lecture-runner.js';

export interface LectureAdapters {
  /** `browser` carries the latest options so the import uses the chosen channel. */
  runImport(
    jobs: SqliteJobRepository,
    onProgress: (stage: ImportStage) => void,
    browser?: LectureBrowserOptions,
  ): Promise<TimetableImportResult>;
  runJob(
    jobs: SqliteJobRepository,
    runs: SqliteRunRepository,
    jobId: string,
    occurrenceId: string,
    signal: AbortSignal,
    browser: LectureBrowserOptions,
  ): Promise<RunResult>;
}

export interface LectureServiceDependencies {
  databasePath: string;
  adapters: LectureAdapters;
  now(): Date;
  onView(view: LecturesView): void;
  onAuthRequired(): void;
  log?: CoreLog;
}

const AGENDA_DAYS = 14;

/** Reports every run write so live statuses (joining, connected, ...) reach the view. */
class NotifyingRunRepository extends SqliteRunRepository {
  constructor(
    store: SqliteStore,
    private readonly onWrite: () => void,
  ) {
    super(store);
  }

  override async update(run: Run): Promise<void> {
    await super.update(run);
    this.onWrite();
  }

  override async claimScheduled(
    jobId: string,
    occurrenceId: string,
    updatedAt: string,
  ): Promise<Run | undefined> {
    const claimed = await super.claimScheduled(jobId, occurrenceId, updatedAt);
    this.onWrite();
    return claimed;
  }
}

interface Repositories {
  store: SqliteStore;
  jobs: SqliteJobRepository;
  runs: SqliteRunRepository;
  meta: SqliteMetaRepository;
  imports: ImportScheduler;
}

interface Activation {
  runner: SingleLectureRunner;
  loop: SchedulerLoop;
}

/** Owns the lecture database, the scheduler loop, timetable imports and the active run. */
export class LectureService {
  private repos: Repositories | undefined;
  private activation: Activation | undefined;
  /** Runners of earlier activations whose lecture is still running. */
  private readonly draining = new Set<SingleLectureRunner>();
  private browser: LectureBrowserOptions = { headless: false };
  private snapshot: { jobs: Job[]; runs: Run[] } = { jobs: [], runs: [] };

  constructor(private readonly deps: LectureServiceDependencies) {}

  async open(): Promise<void> {
    if (this.repos) return;
    const store = new SqliteStore(this.deps.databasePath);
    await store.openWithRecovery();
    const jobs = new SqliteJobRepository(store);
    const runs = new NotifyingRunRepository(store, () => void this.publish());
    const meta = new SqliteMetaRepository(store);
    await runs.failInterrupted(this.deps.now().toISOString());
    const imports = new ImportScheduler({
      runImport: async (onProgress) => {
        const result = await this.deps.adapters.runImport(
          jobs,
          onProgress,
          this.browser,
        );
        if (result.status === 'completed') {
          meta.set(LAST_IMPORT_KEY, this.deps.now().toISOString());
        }
        return result;
      },
      isLectureActive: () => this.lectureActive(),
      lastSuccessAt: () => {
        const value = meta.get(LAST_IMPORT_KEY);
        const parsed = value === undefined ? NaN : Date.parse(value);
        return Number.isNaN(parsed) ? undefined : new Date(parsed);
      },
      now: () => this.deps.now(),
      onView: (view) => {
        if (view.status === 'done') void this.activation?.loop.tick();
        void this.publish();
      },
      onAuthRequired: () => this.deps.onAuthRequired(),
    });
    this.repos = { store, jobs, runs, meta, imports };
    await this.publish();
  }

  activate(trigger: 'login' | 'startup'): void {
    const repos = this.requireRepos();
    if (this.activation) return;
    let wasActive = false;
    const runner: SingleLectureRunner = new SingleLectureRunner({
      runJob: (jobId, occurrenceId, signal) =>
        this.deps.adapters.runJob(
          repos.jobs,
          repos.runs,
          jobId,
          occurrenceId,
          signal,
          this.browser,
        ),
      onChange: () => {
        const active = runner.active !== undefined;
        if (!active) this.draining.delete(runner);
        if (wasActive && !active) repos.imports.lectureFinished();
        wasActive = active;
        void this.publish();
      },
      onAuthRequired: () => this.deps.onAuthRequired(),
    });
    const scheduler = new Scheduler(repos.jobs, repos.runs, runner);
    const loop = new SchedulerLoop({
      check: async (now) => {
        await scheduler.check(now);
        await this.publish();
      },
      now: () => this.deps.now(),
      onError: (error) => this.logError('scheduler', error),
    });
    this.activation = { runner, loop };
    loop.start();
    repos.imports.start(trigger);
    void this.publish();
  }

  deactivate(): void {
    const activation = this.activation;
    if (!activation) return;
    this.activation = undefined;
    activation.loop.stop();
    this.repos?.imports.stop();
    activation.runner.close();
    // The running lecture continues to its own end.
    if (activation.runner.active) this.draining.add(activation.runner);
    void this.publish();
  }

  getView(): LecturesView {
    const now = this.deps.now();
    const agenda = buildAgenda(
      this.snapshot.jobs,
      this.snapshot.runs,
      now,
      AGENDA_DAYS,
    );
    const view: LecturesView = {
      agenda: agenda.entries.map(toItem),
      import: this.repos?.imports.view ?? { status: 'idle' },
    };
    const current = agenda.current;
    if (current?.run) {
      view.current = {
        jobId: current.jobId,
        occurrenceId: current.occurrenceId,
        title: current.title,
        leaveAt: current.leaveAtIso,
        status: current.run.status,
      };
    }
    if (agenda.next) view.next = toItem(agenda.next);
    const last = agenda.lastRun;
    if (last?.run) {
      view.lastRun = {
        title: last.title,
        status: last.run.status,
        ...(last.run.completionReason
          ? { completionReason: last.run.completionReason }
          : {}),
        at: last.run.updatedAt,
      };
    }
    return view;
  }

  async importNow(): Promise<void> {
    await this.requireRepos().imports.request('manual');
  }

  async stopCurrent(): Promise<void> {
    await Promise.all(this.runners().map((runner) => runner.stopCurrent()));
    await this.publish();
  }

  async setSkipped(
    jobId: string,
    occurrenceId: string,
    skipped: boolean,
  ): Promise<void> {
    const repos = this.requireRepos();
    const job = await repos.jobs.getById(jobId);
    if (!job) throw new Error('Lecture not found');
    // Validates the occurrence before anything is stopped.
    setOccurrenceSuppressed(job, occurrenceId, skipped);
    if (skipped) {
      await Promise.all(
        this.runners()
          .filter((runner) => runner.active?.id === occurrenceId)
          .map((runner) => runner.stopCurrent()),
      );
    }
    const latest = (await repos.jobs.getById(jobId)) ?? job;
    await repos.jobs.save(
      setOccurrenceSuppressed(latest, occurrenceId, skipped),
    );
    await this.publish();
  }

  setBrowser(options: LectureBrowserOptions): void {
    this.browser = { ...options };
  }

  resumed(): void {
    void this.activation?.loop.tick();
  }

  async shutdown(timeoutMs: number): Promise<void> {
    this.deactivate();
    const runners = this.runners();
    for (const runner of runners) void runner.stopCurrent();
    const idle = await Promise.all(
      runners.map((runner) => runner.whenIdle(timeoutMs)),
    );
    if (idle.every(Boolean) && this.repos) {
      this.repos.store.close();
      this.repos = undefined;
    }
  }

  private runners(): SingleLectureRunner[] {
    return [
      ...(this.activation ? [this.activation.runner] : []),
      ...this.draining,
    ];
  }

  private lectureActive(): boolean {
    return this.runners().some((runner) => runner.active !== undefined);
  }

  private requireRepos(): Repositories {
    if (!this.repos) throw new Error('Lecture database is not open');
    return this.repos;
  }

  private async publish(): Promise<void> {
    const repos = this.repos;
    if (repos) {
      try {
        const [jobs, runs] = await Promise.all([
          repos.jobs.listAll(),
          repos.runs.listAll(),
        ]);
        this.snapshot = { jobs, runs };
      } catch (error) {
        this.logError('view', error);
      }
    }
    this.deps.onView(this.getView());
  }

  private logError(scope: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.deps.log?.error(`lectures ${scope}: ${redactSensitiveText(message)}`);
  }
}

function toItem(entry: AgendaEntry): AgendaItem {
  return {
    jobId: entry.jobId,
    occurrenceId: entry.occurrenceId,
    title: entry.title,
    date: entry.date,
    joinAt: entry.joinAt,
    leaveAt: entry.leaveAt,
    skipped: entry.skipped,
    ...(entry.run ? { runStatus: entry.run.status } : {}),
  };
}
