import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DateTime } from 'luxon';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunResult } from '@core/core/job-runner.js';
import type { Job, Run } from '@core/core/types.js';
import { SqliteJobRepository } from '@core/persistence/job-repository.js';
import { SqliteMetaRepository } from '@core/persistence/meta-repository.js';
import { SqliteRunRepository } from '@core/persistence/run-repository.js';
import { SqliteStore } from '@core/persistence/sqlite-store.js';
import { LAST_IMPORT_KEY } from '@core/timetable/import-service.js';
import type { LecturesView } from '../../src/shared/lectures.js';
import type { CoreLog } from '../../src/worker/core-log.js';
import { createFakeLectureAdapters } from '../../src/worker/lecture-adapters.fake.js';
import {
  LectureService,
  type LectureAdapters,
} from '../../src/worker/lecture-service.js';

const ZONE = 'Asia/Krasnoyarsk';
const START = new Date('2026-10-15T05:00:00.000Z'); // 12:00 in Krasnoyarsk

let dir: string;
let clock: Date;
let services: LectureService[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lecture-service-'));
  clock = START;
  services = [];
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
  });
});

afterEach(async () => {
  vi.useRealTimers();
  for (const service of services) await service.shutdown(1_000);
  await rm(dir, { recursive: true, force: true });
});

function databasePath(): string {
  return join(dir, 'data', 'lectures.db');
}

function fakeLog() {
  const lines: string[] = [];
  const log: CoreLog = {
    path: '/log',
    info: (message) => lines.push(`INFO ${message}`),
    error: (message) => lines.push(`ERROR ${message}`),
  };
  return { log, lines };
}

function setup(overrides: Partial<LectureAdapters> = {}, log?: CoreLog) {
  const views: LecturesView[] = [];
  const onAuthRequired = vi.fn();
  const fake = createFakeLectureAdapters(() => clock);
  const adapters: LectureAdapters = { ...fake, ...overrides };
  const service = new LectureService({
    databasePath: databasePath(),
    adapters,
    now: () => clock,
    onView: (view) => views.push(view),
    onAuthRequired,
    log,
  });
  services.push(service);
  const last = (): LecturesView | undefined => views.at(-1);
  return { service, views, last, onAuthRequired, fake };
}

async function withStore<T>(
  action: (repos: {
    jobs: SqliteJobRepository;
    runs: SqliteRunRepository;
    meta: SqliteMetaRepository;
  }) => Promise<T>,
): Promise<T> {
  const store = new SqliteStore(databasePath());
  await store.open();
  try {
    return await action({
      jobs: new SqliteJobRepository(store),
      runs: new SqliteRunRepository(store),
      meta: new SqliteMetaRepository(store),
    });
  } finally {
    store.close();
  }
}

function jobAt(joinAt: Date, minutes: number, id = 'tt:seed:1'): Job {
  const start = DateTime.fromJSDate(joinAt, { zone: ZONE });
  const end = start.plus({ minutes });
  return {
    id,
    enabled: true,
    source: 'timetable',
    origin: {
      faculty: 'f',
      group: 'g',
      discipline: 'Сидированная лекция',
      sdoCourseId: '1',
    },
    schedule: {
      type: 'imported',
      timezone: ZONE,
      occurrences: [
        {
          date: start.toISODate()!,
          joinAt: start.toFormat('HH:mm'),
          leaveAt: end.toFormat('HH:mm'),
        },
      ],
    },
    target: {
      type: 'direct',
      activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=2',
    },
    browser: { headless: true },
  };
}

async function seed(job: Job): Promise<void> {
  await withStore(async ({ jobs, meta }) => {
    await jobs.save(job);
    meta.set(LAST_IMPORT_KEY, clock.toISOString());
  });
}

async function connected(last: () => LecturesView | undefined) {
  await vi.waitFor(() => expect(last()?.current?.status).toBe('connected'));
  return last()!.current!;
}

describe('LectureService', () => {
  it('labels legacy jobs without a source as manual', async () => {
    const legacy = jobAt(new Date(START.getTime() + 86_400_000), 60);
    delete legacy.source;
    legacy.schedule = {
      type: 'once',
      date: '2026-10-16',
      joinAt: '12:00',
      leaveAt: '13:00',
      timezone: ZONE,
    };
    await seed(legacy);
    const { service } = setup();
    await service.open();
    expect(service.getView().agenda[0]).toMatchObject({
      source: 'manual',
      editable: true,
    });
    await service.deleteLecture(legacy.id);
    expect(
      await withStore(({ jobs }) => jobs.getById(legacy.id)),
    ).toBeUndefined();
  });

  it('publishes an edited imported time and editability', async () => {
    await seed(jobAt(new Date(START.getTime() + 86_400_000), 60));
    const { service } = setup();
    await service.open();
    expect(service.getView().agenda[0]).toMatchObject({
      source: 'timetable',
      editable: true,
    });
    await service.editImportedTime({
      jobId: 'tt:seed:1',
      date: '2026-10-16',
      joinAt: '13:00',
      leaveAt: '14:00',
    });
    expect(service.getView().agenda[0]).toMatchObject({
      joinAt: '13:00',
      leaveAt: '14:00',
      editable: true,
    });
  });

  it('shows one linked replacement and restores the source after cancellation', async () => {
    await seed(jobAt(new Date(START.getTime() + 86_400_000), 60));
    const { service } = setup();
    await service.open();
    const replacementId = await service.reschedule({
      jobId: 'tt:seed:1',
      date: '2026-10-16',
      newDate: '2026-10-17',
      newJoinAt: '15:00',
      newLeaveAt: '16:00',
    });
    expect(service.getView().agenda).toEqual([
      expect.objectContaining({
        source: 'timetable',
        skipped: true,
        editable: false,
      }),
      expect.objectContaining({
        jobId: replacementId,
        source: 'manual',
        editable: true,
        rescheduledFrom: { jobId: 'tt:seed:1', date: '2026-10-16' },
      }),
    ]);
    await service.cancelReschedule(replacementId);
    expect(service.getView().agenda).toEqual([
      expect.objectContaining({ source: 'timetable', skipped: false }),
    ]);
  });

  it('rejects cancelling a move after its replacement has run', async () => {
    await seed(jobAt(new Date(START.getTime() + 86_400_000), 60));
    const { service } = setup();
    await service.open();
    const replacementId = await service.reschedule({
      jobId: 'tt:seed:1',
      date: '2026-10-16',
      newDate: '2026-10-17',
      newJoinAt: '15:00',
      newLeaveAt: '16:00',
    });
    const occurrenceId = service
      .getView()
      .agenda.find((item) => item.jobId === replacementId)!.occurrenceId;
    await withStore(async ({ runs }) => {
      await runs.getOrCreate({
        jobId: replacementId,
        occurrenceId,
        status: 'completed',
        createdAt: START.toISOString(),
        updatedAt: START.toISOString(),
      });
    });
    await expect(service.cancelReschedule(replacementId)).rejects.toThrow();
  });

  it('hides only the selected imported date', async () => {
    const job = jobAt(new Date(START.getTime() + 86_400_000), 60);
    if (job.schedule.type !== 'imported') throw new Error('Expected imported');
    job.schedule.occurrences.push({
      date: '2026-10-17',
      joinAt: '12:00',
      leaveAt: '13:00',
    });
    await seed(job);
    const { service } = setup();
    await service.open();
    await service.deleteLecture(job.id, '2026-10-16');
    expect(service.getView().agenda.map((item) => item.skipped)).toEqual([
      true,
      false,
    ]);
  });

  it('stops an active manual lecture before deletion and keeps its run', async () => {
    const manual: Job = {
      ...jobAt(new Date(START.getTime() - 60_000), 60),
      id: 'manual:active',
      source: 'manual',
      title: 'Ручная пара',
      schedule: {
        type: 'once',
        date: '2026-10-15',
        joinAt: '11:59',
        leaveAt: '12:59',
        timezone: ZONE,
      },
    };
    await seed(manual);
    const { service, last } = setup();
    await service.open();
    service.activate('startup');
    await connected(last);
    await service.deleteLecture(manual.id);
    expect(
      await withStore(({ jobs }) => jobs.getById(manual.id)),
    ).toBeUndefined();
    expect((await withStore(({ runs }) => runs.listAll()))[0]).toMatchObject({
      status: 'completed',
      completionReason: 'manual',
    });
  });

  it('saves a confirmed manual lecture without exposing its activity URL', async () => {
    const { service } = setup({
      resolveManualTarget: async () => ({
        status: 'resolved',
        course: { id: '1', name: 'Математика' },
        module: {
          id: '2',
          name: 'Лекция',
          type: 'lecture',
          courseUrl: 'https://sdo.tusur.ru/course/view.php?id=1',
          activityUrl:
            'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=2?token=secret',
        },
      }),
    });
    await service.open();
    const lookup = await service.resolveManualTarget('Математика');
    expect(lookup.status).toBe('resolved');
    if (lookup.status !== 'resolved') return;
    const candidateId = lookup.candidates[0]!.id;
    expect(JSON.stringify(lookup)).not.toMatch(/https:|secret|token/);
    const schedule = {
      type: 'once' as const,
      date: '2026-10-16',
      joinAt: '12:00',
      leaveAt: '13:00',
    };
    await expect(
      service.saveManual({ candidateId: 'stale', title: 'Лекция', schedule }),
    ).rejects.toThrow();
    await expect(
      service.saveManual({ candidateId, title: ' ', schedule }),
    ).rejects.toThrow();
    await service.saveManual({ candidateId, title: 'Моя лекция', schedule });
    await expect(
      service.saveManual({ candidateId, title: 'Моя лекция', schedule }),
    ).rejects.toThrow();
    const jobs = await withStore(({ jobs }) => jobs.listAll());
    expect(jobs).toEqual([
      expect.objectContaining({
        source: 'manual',
        title: 'Моя лекция',
        target: {
          type: 'direct',
          activityUrl:
            'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=2?token=secret',
        },
      }),
    ]);
    expect(JSON.stringify(service.getView())).not.toMatch(
      /https:|secret|token/,
    );
  });

  it('keeps a confirmed candidate after a failed save and clears it on shutdown', async () => {
    const { service } = setup();
    await service.open();
    const lookup = await service.resolveManualTarget('Демо');
    if (lookup.status !== 'resolved')
      throw new Error('Expected fake candidate');
    const candidateId = lookup.candidates[0]!.id;
    await expect(
      service.saveManual({
        candidateId,
        title: 'Демо',
        schedule: {
          type: 'once',
          date: '2026-10-14',
          joinAt: '12:00',
          leaveAt: '13:00',
        },
      }),
    ).rejects.toThrow();
    await service.saveManual({
      candidateId,
      title: 'Демо',
      schedule: {
        type: 'once',
        date: '2026-10-16',
        joinAt: '12:00',
        leaveAt: '13:00',
      },
    });
    await service.shutdown(1_000);
    await expect(
      service.saveManual({
        candidateId,
        title: 'Демо',
        schedule: {
          type: 'once',
          date: '2026-10-17',
          joinAt: '12:00',
          leaveAt: '13:00',
        },
      }),
    ).rejects.toThrow();
  });

  it('explains a missing Electron SQLite build without touching the database', async () => {
    const service = new LectureService({
      databasePath: databasePath(),
      sqliteBinding: join(dir, 'native', 'better_sqlite3.node'),
      adapters: createFakeLectureAdapters(() => clock),
      now: () => clock,
      onView: () => undefined,
      onAuthRequired: () => undefined,
    });

    await expect(service.open()).rejects.toThrow(
      'Модуль базы данных для приложения не собран. Выполните: npm run build:native -w @online-lecture/desktop',
    );
    expect(existsSync(databasePath())).toBe(false);
  });

  it('fails interrupted runs on open', async () => {
    await withStore(async ({ runs }) => {
      const run: Run = {
        jobId: 'tt:x',
        occurrenceId: 'tt:x:2026-10-15T08:00:00.000+07:00',
        status: 'connected',
        createdAt: START.toISOString(),
        updatedAt: START.toISOString(),
      };
      await runs.getOrCreate(run);
    });
    const { service } = setup();
    await service.open();
    const stored = await withStore(({ runs }) => runs.listAll());
    expect(stored[0]).toMatchObject({
      status: 'failed',
      completionReason: 'error',
    });
  });

  it('imports after login activation and publishes the agenda', async () => {
    const { service, last } = setup();
    await service.open();
    service.activate('login');
    await vi.waitFor(() => expect(last()?.import.status).toBe('done'));
    expect(last()?.agenda).toEqual([
      expect.objectContaining({
        jobId: 'tt:fake:demo:1',
        title: 'Демонстрационная лекция',
        date: '2026-10-15',
        joinAt: '11:59',
        leaveAt: '13:30',
        skipped: false,
      }),
    ]);
    const stamp = await withStore(async ({ meta }) =>
      meta.get(LAST_IMPORT_KEY),
    );
    expect(stamp).toBe(START.toISOString());
  });

  it('starts the active occurrence and shows it as current', async () => {
    const { service, last } = setup();
    await service.open();
    service.activate('login');
    const current = await connected(last);
    expect(current).toMatchObject({
      jobId: 'tt:fake:demo:1',
      title: 'Демонстрационная лекция',
      status: 'connected',
    });
    expect(last()?.agenda[0]?.runStatus).toBe('connected');
  });

  it('stopCurrent ends the run as manual and publishes lastRun', async () => {
    const { service, last } = setup();
    await service.open();
    service.activate('login');
    await connected(last);
    await service.stopCurrent();
    await vi.waitFor(() =>
      expect(last()?.lastRun).toMatchObject({
        title: 'Демонстрационная лекция',
        status: 'completed',
        completionReason: 'manual',
      }),
    );
    expect(last()?.current).toBeUndefined();
  });

  it('skipping the running occurrence stops it first', async () => {
    const suppressedWhenStopped: boolean[] = [];
    const fake = createFakeLectureAdapters(() => clock);
    const { service, last } = setup({
      runJob: async (jobs, runs, jobId, occurrenceId, signal, browser) => {
        const result = await fake.runJob(
          jobs,
          runs,
          jobId,
          occurrenceId,
          signal,
          browser,
        );
        const job = await jobs.getById(jobId);
        if (job?.schedule.type === 'imported') {
          suppressedWhenStopped.push(
            job.schedule.occurrences[0]?.suppressed === true,
          );
        }
        return result;
      },
    });
    await service.open();
    service.activate('login');
    const current = await connected(last);
    await service.setSkipped(current.jobId, current.occurrenceId, true);
    expect(suppressedWhenStopped).toEqual([false]);
    const runs = await withStore(({ runs }) => runs.listAll());
    expect(runs[0]).toMatchObject({
      status: 'completed',
      completionReason: 'manual',
    });
    expect(last()?.agenda[0]?.skipped).toBe(true);
  });

  it('skipped occurrences are not started', async () => {
    await seed(jobAt(new Date(START.getTime() - 60_000), 90));
    const runJob = vi.fn();
    const { service } = setup({ runJob });
    await service.open();
    const [item] = service.getView().agenda;
    expect(service.getView().import).toEqual({
      status: 'idle',
      lastSuccessAt: START.toISOString(),
    });
    await service.setSkipped(item!.jobId, item!.occurrenceId, true);
    service.activate('startup');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runJob).not.toHaveBeenCalled();
    expect(service.getView().agenda[0]?.skipped).toBe(true);
  });

  it('keeps the running lecture when an import removes its job', async () => {
    let removeJobs = false;
    let signal: AbortSignal | undefined;
    const fake = createFakeLectureAdapters(() => clock);
    const { service, last } = setup({
      runImport: async (jobs, onProgress, browser) => {
        if (!removeJobs) return fake.runImport(jobs, onProgress, browser);
        await jobs.replaceTimetableJobs([]);
        return {
          status: 'completed',
          faculty: 'f',
          group: 'g',
          lessons: 0,
          complete: true,
          summary: {
            added: 0,
            removed: 1,
            preservedEdits: 0,
            jobsCreated: 0,
            jobsDeleted: 1,
          },
          unresolved: [],
          ambiguous: [],
          unmapped: [],
        };
      },
      runJob: (jobs, runs, jobId, occurrenceId, runSignal, browser) => {
        signal = runSignal;
        return fake.runJob(jobs, runs, jobId, occurrenceId, runSignal, browser);
      },
    });
    await service.open();
    service.activate('login');
    await connected(last);
    removeJobs = true;
    await service.importNow();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(signal?.aborted).toBe(false);
    const runs = await withStore(({ runs }) => runs.listAll());
    expect(runs[0]?.status).toBe('connected');
    expect(last()?.agenda).toEqual([]);
    expect(service.getView().current).toMatchObject({
      jobId: 'tt:fake:demo:1',
      occurrenceId: runs[0]?.occurrenceId,
      title: 'Демонстрационная лекция',
      status: 'connected',
    });
    await service.stopCurrent();
    expect(service.getView().current).toBeUndefined();
  });

  it('stops scheduling after deactivate', async () => {
    await seed(jobAt(new Date(START.getTime() + 5 * 60_000), 90));
    const runJob = vi.fn();
    const { service } = setup({ runJob });
    await service.open();
    service.activate('startup');
    service.deactivate();
    clock = new Date(START.getTime() + 6 * 60_000);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(runJob).not.toHaveBeenCalled();
  });

  it('reports auth_required from a run', async () => {
    const { service, onAuthRequired } = setup({
      runJob: async (_jobs, _runs, jobId, occurrenceId) =>
        ({
          jobId,
          occurrenceId,
          status: 'failed',
          completionReason: 'error',
          authRequired: true,
          durationSeconds: 0,
        }) satisfies RunResult,
    });
    await service.open();
    service.activate('login');
    await vi.waitFor(() => expect(onAuthRequired).toHaveBeenCalledTimes(1));
  });

  it('logs the redacted reason of a failed run', async () => {
    const { log, lines } = fakeLog();
    const { service } = setup(
      {
        runJob: async (_jobs, _runs, jobId, occurrenceId) =>
          ({
            jobId,
            occurrenceId,
            status: 'failed',
            completionReason: 'error',
            error:
              'join failed at https://bbb2.tusur.ru/b/abc?sessionToken=xyz',
            durationSeconds: 0,
          }) satisfies RunResult,
      },
      log,
    );
    await service.open();
    service.activate('login');
    await vi.waitFor(() =>
      expect(lines.some((line) => line.includes('lecture failed'))).toBe(true),
    );
    const line = lines.find((entry) => entry.includes('lecture failed'))!;
    expect(line).toContain('reason=error');
    expect(line).not.toContain('bbb2.tusur.ru');
    expect(line).not.toContain('xyz');
  });

  it('logs a crashed lecture run without secrets', async () => {
    const { log, lines } = fakeLog();
    const { service } = setup(
      {
        runJob: async () => {
          throw new Error('boom https://sdo.tusur.ru/mod/x?token=abc');
        },
      },
      log,
    );
    await service.open();
    service.activate('login');
    await vi.waitFor(() =>
      expect(lines.some((line) => line.includes('lecture run crashed'))).toBe(
        true,
      ),
    );
    expect(lines.join('\n')).not.toContain('token=abc');
  });

  it('logs a failed import', async () => {
    const { log, lines } = fakeLog();
    const { service } = setup(
      {
        runImport: async () => ({
          status: 'failed',
          message: 'fetch https://timetable.tusur.ru/x?sessionToken=zzz failed',
        }),
      },
      log,
    );
    await service.open();
    service.activate('login');
    await vi.waitFor(() =>
      expect(lines.some((line) => line.includes('import failed'))).toBe(true),
    );
    expect(lines.join('\n')).not.toContain('zzz');
  });

  it('logs when an import needs authentication', async () => {
    const { log, lines } = fakeLog();
    const { service } = setup(
      { runImport: async () => ({ status: 'auth_required' }) },
      log,
    );
    await service.open();
    service.activate('login');
    await vi.waitFor(() =>
      expect(lines.some((line) => line.includes('import auth_required'))).toBe(
        true,
      ),
    );
  });

  it('passes channel and headless to runJob', async () => {
    const fake = createFakeLectureAdapters(() => clock);
    const runJob = vi.fn(fake.runJob);
    const { service } = setup({ runJob });
    await service.open();
    service.setBrowser({ channel: 'msedge', headless: true });
    service.activate('login');
    await vi.waitFor(() => expect(runJob).toHaveBeenCalled());
    expect(runJob.mock.calls[0]?.[5]).toEqual({
      channel: 'msedge',
      headless: true,
    });
  });

  it('resumed triggers an immediate check', async () => {
    await seed(jobAt(new Date(START.getTime() + 5 * 60_000), 90));
    const fake = createFakeLectureAdapters(() => clock);
    const runJob = vi.fn(fake.runJob);
    const { service } = setup({ runJob });
    await service.open();
    service.activate('startup');
    await vi.advanceTimersByTimeAsync(0);
    expect(runJob).not.toHaveBeenCalled();
    clock = new Date(START.getTime() + 6 * 60_000);
    service.resumed();
    await vi.waitFor(() => expect(runJob).toHaveBeenCalledTimes(1), {
      interval: 1,
    });
  });

  it('shutdown aborts and waits at most the timeout', async () => {
    let signal: AbortSignal | undefined;
    const { service } = setup({
      runJob: (_jobs, _runs, _jobId, _occurrenceId, runSignal) => {
        signal = runSignal;
        return new Promise<RunResult>(() => undefined);
      },
    });
    await service.open();
    service.activate('login');
    await vi.waitFor(() => expect(signal).toBeDefined());
    let finished = false;
    const done = service.shutdown(10_000).then(() => {
      finished = true;
    });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(signal?.aborted).toBe(true);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(finished).toBe(true);
  });

  it('view contains no URLs', async () => {
    const { service, last } = setup();
    await service.open();
    service.activate('login');
    await connected(last);
    await service.stopCurrent();
    await vi.waitFor(() => expect(last()?.lastRun).toBeDefined());
    expect(JSON.stringify(service.getView())).not.toContain('http');
    expect(JSON.stringify(last())).not.toContain('http');
  });

  it('keeps one lecture across deactivate and activate', async () => {
    const fake = createFakeLectureAdapters(() => clock);
    let inFlight = 0;
    let maxInFlight = 0;
    const runJob = vi.fn(
      async (
        ...args: Parameters<LectureAdapters['runJob']>
      ): Promise<RunResult> => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        try {
          return await fake.runJob(...args);
        } finally {
          inFlight -= 1;
        }
      },
    );
    const { service, last } = setup({ runJob });
    await service.open();
    service.activate('login');
    await connected(last);
    await seed(jobAt(new Date(START.getTime() - 60_000), 90, 'tt:seed:2'));
    service.deactivate();
    service.activate('startup');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runJob).toHaveBeenCalledTimes(1);
    expect(maxInFlight).toBe(1);
  });

  it('skipping a queued occurrence prevents its launch', async () => {
    const fake = createFakeLectureAdapters(() => clock);
    const runJob = vi.fn(fake.runJob);
    const { service, last } = setup({ runJob });
    await service.open();
    service.activate('login');
    await connected(last);
    await seed(jobAt(new Date(START.getTime() - 60_000), 90, 'tt:seed:2'));
    await vi.advanceTimersByTimeAsync(30_000);
    const queued = service
      .getView()
      .agenda.find((item) => item.jobId === 'tt:seed:2');
    expect(queued?.runStatus).toBe('scheduled');
    await service.setSkipped(queued!.jobId, queued!.occurrenceId, true);
    await service.stopCurrent();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runJob).toHaveBeenCalledTimes(1);
    const view = service.getView();
    expect(
      view.agenda.find((item) => item.jobId === 'tt:seed:2'),
    ).toMatchObject({ skipped: true, runStatus: 'skipped' });
  });
});
