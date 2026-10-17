import { describe, expect, it } from 'vitest';
import { mergeImportedJobs } from '../../src/timetable/import-merger.js';
import {
  editImportedTime,
  makeRescheduledJob,
  validateManualSchedule,
} from '../../src/core/schedule-editing.js';
import type { Job } from '../../src/core/types.js';

const now = new Date('2026-10-20T03:00:00.000Z');

function imported(): Job {
  return {
    id: 'tt:f:group:17',
    enabled: true,
    source: 'timetable',
    origin: {
      faculty: 'f',
      group: 'group',
      discipline: 'Физика',
      sdoCourseId: '17',
    },
    schedule: {
      type: 'imported',
      timezone: 'Asia/Krasnoyarsk',
      occurrences: [
        { date: '2026-10-21', joinAt: '10:00', leaveAt: '11:35', room: '101' },
        { date: '2026-10-28', joinAt: '10:00', leaveAt: '11:35' },
      ],
    },
    target: { type: 'search', courseId: '17', courseName: 'Физика' },
    browser: { headless: false },
  };
}

describe('schedule editing', () => {
  it('edits one date without mutating its source and survives the next import', () => {
    const source = imported();
    const edited = editImportedTime(source, {
      jobId: source.id,
      date: '2026-10-21',
      joinAt: '12:00',
      leaveAt: '13:35',
    });
    expect(
      source.schedule.type === 'imported' &&
        source.schedule.occurrences[0]?.joinAt,
    ).toBe('10:00');
    expect(edited.schedule).toMatchObject({
      occurrences: [
        {
          date: '2026-10-21',
          joinAt: '12:00',
          leaveAt: '13:35',
          room: '101',
          edited: true,
        },
        { date: '2026-10-28', joinAt: '10:00' },
      ],
    });
    const merged = mergeImportedJobs([edited], [source]);
    expect(merged.jobs[0]!.schedule).toMatchObject({
      occurrences: [
        { date: '2026-10-21', joinAt: '12:00', edited: true },
        { date: '2026-10-28', joinAt: '10:00' },
      ],
    });
  });

  it('rejects malformed, past and overnight manual intervals', () => {
    expect(() =>
      validateManualSchedule(
        { type: 'once', date: '2026-10-19', joinAt: '10:00', leaveAt: '11:00' },
        now,
      ),
    ).toThrow();
    expect(() =>
      validateManualSchedule(
        { type: 'once', date: '2026-10-21', joinAt: '11:00', leaveAt: '10:00' },
        now,
      ),
    ).toThrow();
    expect(() =>
      validateManualSchedule(
        { type: 'once', date: '2026-10-21', joinAt: 'bad', leaveAt: '11:00' },
        now,
      ),
    ).toThrow();
    expect(() =>
      validateManualSchedule(
        { type: 'weekly', days: [], joinAt: '11:00', leaveAt: '12:00' },
        now,
      ),
    ).toThrow();
    expect(() =>
      validateManualSchedule(
        { type: 'once', date: '2026-10-21', joinAt: '11:00', leaveAt: '12:00' },
        now,
      ),
    ).not.toThrow();
  });

  it('moves one imported date into a linked manual once job', () => {
    const source = imported();
    const result = makeRescheduledJob(
      source,
      {
        jobId: source.id,
        date: '2026-10-21',
        newDate: '2026-10-24',
        newJoinAt: '12:00',
        newLeaveAt: '13:35',
      },
      'manual:moved-1',
    );
    expect(result.source.schedule).toMatchObject({
      occurrences: [
        { date: '2026-10-21', suppressed: true },
        { date: '2026-10-28' },
      ],
    });
    expect(result.replacement).toMatchObject({
      id: 'manual:moved-1',
      source: 'manual',
      title: 'Физика',
      rescheduledFrom: { jobId: source.id, date: '2026-10-21' },
      schedule: {
        type: 'once',
        date: '2026-10-24',
        joinAt: '12:00',
        leaveAt: '13:35',
      },
      target: source.target,
    });
    expect(
      source.schedule.type === 'imported' &&
        source.schedule.occurrences[0]?.suppressed,
    ).toBeUndefined();
  });
});
