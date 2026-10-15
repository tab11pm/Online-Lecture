import { describe, expect, it } from 'vitest';

import { setOccurrenceSuppressed } from '../../src/core/occurrence-suppression.js';
import type { Job } from '../../src/core/types.js';

const job: Job = {
  id: 'tt:fvs:574-1:22413',
  enabled: true,
  source: 'timetable',
  schedule: {
    type: 'imported',
    timezone: 'Asia/Krasnoyarsk',
    occurrences: [
      { date: '2026-10-19', joinAt: '10:00', leaveAt: '11:35' },
      { date: '2026-10-19', joinAt: '11:45', leaveAt: '13:20' },
      { date: '2026-10-26', joinAt: '10:00', leaveAt: '11:35' },
    ],
  },
  target: { type: 'search', courseName: 'Физика' },
  browser: { headless: false },
};
const first = `${job.id}:2026-10-19T10:00:00.000+07:00`;

function suppressedFlags(value: Job): (boolean | undefined)[] {
  if (value.schedule.type !== 'imported') throw new Error('not imported');
  return value.schedule.occurrences.map((entry) => entry.suppressed);
}

describe('setOccurrenceSuppressed', () => {
  it('suppresses one occurrence and keeps the others', () => {
    const updated = setOccurrenceSuppressed(job, first, true);
    expect(suppressedFlags(updated)).toEqual([true, undefined, undefined]);
  });

  it('restores a suppressed occurrence', () => {
    const suppressed = setOccurrenceSuppressed(job, first, true);
    const restored = setOccurrenceSuppressed(suppressed, first, false);
    expect(suppressedFlags(restored).every((flag) => !flag)).toBe(true);
  });

  it('rejects non-imported jobs and unknown occurrences', () => {
    const weekly: Job = {
      ...job,
      schedule: {
        type: 'weekly',
        days: ['mon'],
        joinAt: '10:00',
        leaveAt: '11:35',
        timezone: 'Asia/Krasnoyarsk',
      },
    };
    expect(() => setOccurrenceSuppressed(weekly, first, true)).toThrow(
      'Occurrence not found',
    );
    expect(() =>
      setOccurrenceSuppressed(
        job,
        `${job.id}:2026-11-02T10:00:00.000+07:00`,
        true,
      ),
    ).toThrow('Occurrence not found');
    expect(() => setOccurrenceSuppressed(job, 'garbage', true)).toThrow(
      'Occurrence not found',
    );
  });

  it('does not mutate the input job', () => {
    const snapshot = structuredClone(job);
    setOccurrenceSuppressed(job, first, true);
    expect(job).toEqual(snapshot);
  });
});
