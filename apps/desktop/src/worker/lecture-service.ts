import type { RunResult } from '@core/core/job-runner.js';
import { randomUUID } from 'node:crypto';
import {
  SCHEDULE_TIMEZONE,
  type ManualScheduleInput,
} from '@core/core/schedule-editing.js';
import { buildAgenda, type AgendaEntry } from '@core/core/lecture-agenda.js';
import { setOccurrenceSuppressed } from '@core/core/occurrence-suppression.js';
import { redactSensitiveText } from '@core/core/redaction.js';
import { Scheduler } from '@core/core/scheduler.js';
import type { Job, OnlineLectureResolution, Run } from '@core/core/types.js';
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
import { ManualTargetStore, parseManualQuery, type ManualTargetLookup } from './manual-targets.js';
import { SchedulerLoop } from './scheduler-loop.js';
import { SingleLectureRunner } from './single-lecture-runner.js';

export interface LectureAdapters {
  resolveManualTarget(query: { courseUrl?: string; courseQuery?: string }): Promise<OnlineLectureResolution>;
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
  imports: ImportScheduler;
  runner: SingleLectureRunner;
  loop: SchedulerLoop;
}

/** Owns the lecture database, the scheduler loop, timetable imports and the one lecture runner. */
export class LectureService {
  private readonly manualTargets = new ManualTargetStore();
  private repos: Repositories | undefined;
  private active = false;
  /** Title of the running occurrence, kept in case an import removes its job. */
  private launched: { occurrenceId: string; title: string } | undefined;
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
        let result: TimetableImportResult;
        try {
          result = await this.deps.adapters.runImport(
            jobs,
            onProgress,
            this.browser,
          );
        } catch (error) {
          this.logError('import failed', error);
          throw error;
        }
        if (result.status === 'failed') {
          this.logError('import failed', result.message);
        } else if (result.status === 'auth_required') {
          this.logError('import auth_required', 'authentication required');
        }
        if (result.status === 'completed') {
          meta.set(LAST_IMPORT_KEY, this.deps.now().toISOString());
        }
        return result;
      },
      isLectureActive: () => runner.active !== undefined,
      lastSuccessAt: () => {
        const value = meta.get(LAST_IMPORT_KEY);
        const parsed = value === undefined ? NaN : Date.parse(value);
        return Number.isNaN(parsed) ? undefined : new Date(parsed);
      },
      now: () => this.deps.now(),
      onView: (view) => {
        if (view.status === 'done' && this.active) void loop.tick();
        void this.publish();
      },
      onAuthRequired: () => this.deps.onAuthRequired(),
    });
    let wasActive = false;
    const runner: SingleLectureRunner = new SingleLectureRunner({
      runJob: async (jobId, occurrenceId, signal) => {
        const job = await jobs.getById(jobId);
        const title = job?.origin?.discipline ?? jobId;
        this.launched = { occurrenceId, title };
        const result = await this.deps.adapters.runJob(
          jobs,
          runs,
          jobId,
          occurrenceId,
          signal,
          this.browser,
        );
        if (result.status === 'failed' || result.status === 'blocked') {
          this.logError(
            `lecture ${result.status} reason=${result.completionReason ?? 'unknown'}`,
            result.error ?? 'no details',
          );
        }
        return result;
      },
      onError: (error) => this.logError('lecture run crashed', error),
      onChange: () => {
        const running = runner.active !== undefined;
        if (wasActive && !running) imports.lectureFinished();
        wasActive = running;
        void this.publish();
      },
      onAuthRequired: () => this.deps.onAuthRequired(),
    });
    const scheduler = new Scheduler(jobs, runs, runner);
    const loop = new SchedulerLoop({
      check: async (now) => {
        await scheduler.check(now);
        await this.publish();
      },
      now: () => this.deps.now(),
      onError: (error) => this.logError('scheduler', error),
    });
    this.repos = { store, jobs, runs, imports, runner, loop };
    await this.publish();
  }

  activate(trigger: 'login' | 'startup'): void {
    const repos = this.requireRepos();
    if (this.active) return;
    this.active = true;
    repos.loop.start();
    repos.imports.start(trigger);
    void this.publish();
  }

  /** Stops scheduling and imports; the running lecture and the queue continue. */
  deactivate(): void {
    if (!this.active) return;
    this.active = false;
    this.repos?.loop.stop();
    this.repos?.imports.stop();
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
    } else {
      const orphan = this.orphanedCurrent();
      if (orphan) view.current = orphan;
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

  async resolveManualTarget(query: string): Promise<ManualTargetLookup> {
    this.requireRepos();
    const input = parseManualQuery(query);
    this.manualTargets.clear();
    const resolution = await this.deps.adapters.resolveManualTarget(input);
    return this.manualTargets.remember(resolution, query);
  }

  async saveManual(input: {
    candidateId: string;
    title: string;
    schedule: ManualScheduleInput;
  }): Promise<void> {
    const repos = this.requireRepos();
    const target = this.manualTargets.get(input.candidateId);
    if (!target) throw new Error('Select a confirmed SDO activity');
    const title = input.title.trim();
    if (!title) throw new Error('Enter a lecture title');
    const job: Job = {
      id: `manual:${randomUUID()}`,
      enabled: true,
      source: 'manual',
      title,
      schedule: { ...input.schedule, timezone: SCHEDULE_TIMEZONE },
      target: { type: 'direct', activityUrl: target.activityUrl },
      browser: { headless: this.browser.headless },
    };
    await repos.jobs.saveManual(job, this.deps.now());
    this.manualTargets.consume(input.candidateId);
    await this.publish();
    if (this.active) void repos.loop.tick();
  }

  async stopCurrent(): Promise<void> {
    await this.repos?.runner.stopCurrent();
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
      // Aborts the occurrence if it runs, or drops it from the queue.
      await repos.runner.stop(
        { id: occurrenceId, jobId, joinAt: '', leaveAt: '', timezone: '' },
        'manual',
      );
      await repos.runs.skipScheduled(
        jobId,
        occurrenceId,
        this.deps.now().toISOString(),
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
    if (this.active) void this.repos?.loop.tick();
  }

  async shutdown(timeoutMs: number): Promise<void> {
    this.manualTargets.clear();
    this.deactivate();
    const repos = this.repos;
    if (!repos) return;
    repos.runner.close();
    void repos.runner.stopCurrent();
    if (await repos.runner.whenIdle(timeoutMs)) {
      repos.store.close();
      this.repos = undefined;
    }
  }

  /** The running lecture whose job an import removed from the agenda. */
  private orphanedCurrent(): LecturesView['current'] {
    const occurrence = this.repos?.runner.active;
    if (!occurrence) return undefined;
    const run = this.snapshot.runs.find(
      (entry) =>
        entry.jobId === occurrence.jobId &&
        entry.occurrenceId === occurrence.id,
    );
    if (!run) return undefined;
    const title =
      this.launched?.occurrenceId === occurrence.id
        ? this.launched.title
        : occurrence.jobId;
    return {
      jobId: occurrence.jobId,
      occurrenceId: occurrence.id,
      title,
      leaveAt: occurrence.leaveAt,
      status: run.status,
    };
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
