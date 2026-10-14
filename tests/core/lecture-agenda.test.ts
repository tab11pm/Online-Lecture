import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';

import { buildAgenda } from '../../src/core/lecture-agenda.js';
import { findActiveOccurrence } from '../../src/core/occurrence.js';
import type { Job, Run } from '../../src/core/types.js';

const zone = 'Asia/Krasnoyarsk';

function importedJob(
  occurrences: {
    date: string;
    joinAt: string;
    leaveAt: string;
    suppressed?: boolean;
  }[],
  id = 'tt:fvs:574-1:22413',
): Job {
  return {
    id,
    enabled: true,
    source: 'timetable',
    origin: {
      faculty: 'fvs',
      group: '574-1',
      discipline: 'Физика',
      sdoCourseId: '1',
    },
    schedule: { type: 'imported', timezone: zone, occurrences },
    target: { type: 'search', courseName: 'Физика' },
    browser: { headless: false },
  };
}

const at = (iso: string): Date => DateTime.fromISO(iso).toJSDate();

function run(job: Job, occurrenceId: string, patch: Partial<Run>): Run {
  return {
    jobId: job.id,
    occurrenceId,
    status: 'scheduled',
    createdAt: '2026-10-19T00:00:00Z',
    updatedAt: '2026-10-19T00:00:00Z',
    ...patch,
  };
}

describe('buildAgenda', () => {
  it('expands imported occurrences within the horizon sorted by time', () => {
    const job = importedJob([
      { date: '2026-10-21', joinAt: '10:00', leaveAt: '11:35' },
      { date: '2026-10-19', joinAt: '11:45', leaveAt: '13:20' },
      { date: '2026-10-19', joinAt: '10:00', leaveAt: '11:35' },
      { date: '2026-10-18', joinAt: '10:00', leaveAt: '11:35' },
      { date: '2026-10-30', joinAt: '10:00', leaveAt: '11:35' },
    ]);
    const agenda = buildAgenda([job], [], at('2026-10-19T08:00:00+07:00'), 7);
    expect(agenda.entries.map((e) => `${e.date} ${e.joinAt}`)).toEqual([
      '2026-10-19 10:00',
      '2026-10-19 11:45',
      '2026-10-21 10:00',
    ]);
    expect(agenda.entries[0]).toMatchObject({
      jobId: job.id,
      title: 'Физика',
      leaveAt: '11:35',
      skipped: false,
    });
    expect(agenda.next?.joinAt).toBe('10:00');
  });

  it('marks suppressed entries as skipped and excludes them from next', () => {
    const job = importedJob([
      {
        date: '2026-10-19',
        joinAt: '10:00',
        leaveAt: '11:35',
        suppressed: true,
      },
      { date: '2026-10-19', joinAt: '11:45', leaveAt: '13:20' },
    ]);
    const agenda = buildAgenda([job], [], at('2026-10-19T08:00:00+07:00'), 3);
    expect(agenda.entries.map((e) => e.skipped)).toEqual([true, false]);
    expect(agenda.next?.joinAt).toBe('11:45');
  });

  it('reports the running entry as current', () => {
    const job = importedJob([
      { date: '2026-10-19', joinAt: '10:00', leaveAt: '11:35' },
      { date: '2026-10-19', joinAt: '11:45', leaveAt: '13:20' },
    ]);
    const id = `${job.id}:2026-10-19T10:00:00.000+07:00`;
    const agenda = buildAgenda(
      [job],
      [run(job, id, { status: 'connected' })],
      at('2026-10-19T10:30:00+07:00'),
      3,
    );
    expect(agenda.current?.occurrenceId).toBe(id);
    expect(agenda.current?.run?.status).toBe('connected');
    expect(agenda.next?.joinAt).toBe('11:45');

    const done = buildAgenda(
      [job],
      [run(job, id, { status: 'completed' })],
      at('2026-10-19T10:30:00+07:00'),
      3,
    );
    expect(done.current).toBeUndefined();
  });

  it('picks the latest terminal run as lastRun', () => {
    const job = importedJob([
      { date: '2026-10-19', joinAt: '10:00', leaveAt: '11:35' },
      { date: '2026-10-19', joinAt: '11:45', leaveAt: '13:20' },
    ]);
    const a = `${job.id}:2026-10-19T10:00:00.000+07:00`;
    const b = `${job.id}:2026-10-19T11:45:00.000+07:00`;
    const agenda = buildAgenda(
      [job],
      [
        run(job, a, { status: 'completed', updatedAt: '2026-10-19T04:35:00Z' }),
        run(job, b, { status: 'failed', updatedAt: '2026-10-19T06:20:00Z' }),
      ],
      at('2026-10-19T14:00:00+07:00'),
      1,
    );
    expect(agenda.lastRun?.occurrenceId).toBe(b);
  });

  it('uses the job timezone for date boundaries', () => {
    const job = importedJob([
      { date: '2026-10-19', joinAt: '00:30', leaveAt: '02:00' },
      { date: '2026-10-18', joinAt: '23:00', leaveAt: '23:59' },
    ]);
    // 2026-10-18T17:30Z is 2026-10-19 00:30 in Krasnoyarsk (+07:00).
    const agenda = buildAgenda([job], [], at('2026-10-18T17:10:00Z'), 1);
    expect(agenda.entries.map((e) => e.date)).toEqual(['2026-10-19']);
    expect(agenda.next?.joinAt).toBe('00:30');
  });

  it('occurrence ids match findActiveOccurrence', () => {
    const job = importedJob([
      { date: '2026-10-19', joinAt: '10:00', leaveAt: '11:35' },
    ]);
    const now = at('2026-10-19T10:30:00+07:00');
    const agenda = buildAgenda([job], [], now, 1);
    expect(agenda.entries[0]?.occurrenceId).toBe(
      findActiveOccurrence(job, now)?.id,
    );
  });

  it('expands once and enabled weekly schedules', () => {
    const once: Job = {
      ...importedJob([]),
      id: 'once',
      origin: undefined,
      schedule: {
        type: 'once',
        date: '2026-10-20',
        joinAt: '09:00',
        leaveAt: '10:00',
        timezone: zone,
      },
    };
    const weekly: Job = {
      ...once,
      id: 'weekly',
      schedule: {
        type: 'weekly',
        days: ['mon', 'wed'],
        joinAt: '08:00',
        leaveAt: '09:00',
        timezone: zone,
      },
    };
    const off: Job = { ...weekly, id: 'off', enabled: false };
    const agenda = buildAgenda(
      [once, weekly, off],
      [],
      at('2026-10-19T00:30:00+07:00'),
      3,
    );
    expect(agenda.entries.map((e) => `${e.jobId} ${e.date}`)).toEqual([
      'weekly 2026-10-19',
      'once 2026-10-20',
      'weekly 2026-10-21',
    ]);
    expect(agenda.entries[1]?.title).toBe('once');
  });
});
