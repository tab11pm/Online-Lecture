import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';

import { Scheduler } from '../../src/core/scheduler.js';
import type {
  Job,
  JobRepository,
  LectureRunner,
  Run,
  RunRepository,
} from '../../src/core/types.js';

const job: Job = {
  id: 'math-monday',
  enabled: true,
  schedule: {
    type: 'weekly',
    days: ['mon'],
    joinAt: '10:00',
    leaveAt: '11:35',
    timezone: 'Asia/Krasnoyarsk',
  },
  target: { type: 'search', course: 'Математика' },
  browser: { headless: false },
};

describe('Scheduler', () => {
  it('stores one scheduled run for an active occurrence without reporting connection', async () => {
    const storedRuns: Run[] = [];
    const jobs: JobRepository = {
      listEnabled: async () => [job],
      getById: async () => job,
      save: async () => undefined,
    };
    const runs: RunRepository = {
      getOrCreate: async (run) => {
        const existing = storedRuns.find(
          (item) =>
            item.jobId === run.jobId && item.occurrenceId === run.occurrenceId,
        );
        if (existing !== undefined) return { run: existing, created: false };
        storedRuns.push(run);
        return { run, created: true };
      },
      update: async () => undefined,
    };
    const runner: LectureRunner = {
      start: async () => undefined,
      stop: async () => undefined,
    };
    const scheduler = new Scheduler(jobs, runs, runner);

    const result = await scheduler.check(
      DateTime.fromISO('2026-09-28T03:15:00Z').toJSDate(),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      status: 'scheduled',
      jobId: 'math-monday',
    });
    expect(storedRuns).toHaveLength(1);
    expect(storedRuns[0]?.status).not.toBe('connected');
  });
});
