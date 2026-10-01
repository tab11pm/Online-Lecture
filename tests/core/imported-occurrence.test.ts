import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { findActiveOccurrence } from '../../src/core/occurrence.js';
import type { Job } from '../../src/core/types.js';

const importedJob: Job = {
  id: 'tt:fvs:574-1:22413',
  enabled: true,
  source: 'timetable',
  origin: {
    faculty: 'fvs',
    group: '574-1',
    discipline: 'РМП2',
    sdoCourseId: '22413',
  },
  schedule: {
    type: 'imported',
    timezone: 'Asia/Tomsk',
    occurrences: [
      { date: '2026-09-30', joinAt: '13:15', leaveAt: '14:50' },
      {
        date: '2026-10-07',
        joinAt: '13:15',
        leaveAt: '14:50',
        suppressed: true,
      },
    ],
  },
  target: { type: 'search', courseId: '22413', courseName: 'РМП2' },
  browser: { headless: true },
};

describe('findActiveOccurrence for imported schedule', () => {
  it('returns the matching dated occurrence', () => {
    const now = DateTime.fromISO('2026-09-30T13:20:00+07:00').toJSDate();
    expect(findActiveOccurrence(importedJob, now)).toMatchObject({
      id: 'tt:fvs:574-1:22413:2026-09-30T13:15:00.000+07:00',
      jobId: 'tt:fvs:574-1:22413',
      joinAt: '2026-09-30T13:15:00.000+07:00',
      leaveAt: '2026-09-30T14:50:00.000+07:00',
      timezone: 'Asia/Tomsk',
    });
  });

  it('does not return a suppressed occurrence', () => {
    const now = DateTime.fromISO('2026-10-07T13:20:00+07:00').toJSDate();
    expect(findActiveOccurrence(importedJob, now)).toBeUndefined();
  });

  it('does not return on a date without an occurrence', () => {
    const now = DateTime.fromISO('2026-10-01T13:20:00+07:00').toJSDate();
    expect(findActiveOccurrence(importedJob, now)).toBeUndefined();
  });
});
