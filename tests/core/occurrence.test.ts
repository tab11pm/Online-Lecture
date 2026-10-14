import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';

import { findActiveOccurrence } from '../../src/core/occurrence.js';
import type { Job } from '../../src/core/types.js';

const weeklyJob: Job = {
  id: 'math-monday',
  enabled: true,
  schedule: {
    type: 'weekly',
    days: ['mon'],
    joinAt: '10:00',
    leaveAt: '11:35',
    timezone: 'Asia/Krasnoyarsk',
  },
  target: { type: 'search', courseId: 'Математика' },
  browser: { headless: false },
};

describe('findActiveOccurrence', () => {
  it('returns the weekly occurrence when started late but before leaveAt', () => {
    const now = DateTime.fromISO('2026-09-28T10:15:00+07:00').toJSDate();

    expect(findActiveOccurrence(weeklyJob, now)).toMatchObject({
      id: 'math-monday:2026-09-28T10:00:00.000+07:00',
      jobId: 'math-monday',
      joinAt: '2026-09-28T10:00:00.000+07:00',
      leaveAt: '2026-09-28T11:35:00.000+07:00',
      timezone: 'Asia/Krasnoyarsk',
    });
  });

  it('does not return an occurrence after its hard leaveAt', () => {
    const now = DateTime.fromISO('2026-09-28T11:35:00+07:00').toJSDate();

    expect(findActiveOccurrence(weeklyJob, now)).toBeUndefined();
  });

  it('uses the configured timezone rather than the process timezone', () => {
    const now = DateTime.fromISO('2026-09-28T03:15:00Z').toJSDate();

    expect(findActiveOccurrence(weeklyJob, now)?.joinAt).toBe(
      '2026-09-28T10:00:00.000+07:00',
    );
  });

  it('picks the imported entry whose window contains now', () => {
    const job: Job = {
      ...weeklyJob,
      id: 'imp',
      schedule: {
        type: 'imported',
        timezone: 'Asia/Krasnoyarsk',
        occurrences: [
          { date: '2026-10-19', joinAt: '10:00', leaveAt: '11:35' },
          { date: '2026-10-19', joinAt: '11:45', leaveAt: '13:20' },
        ],
      },
    };
    const now = DateTime.fromISO('2026-10-19T12:00:00+07:00').toJSDate();

    expect(findActiveOccurrence(job, now)?.joinAt).toBe(
      '2026-10-19T11:45:00.000+07:00',
    );
  });
});
