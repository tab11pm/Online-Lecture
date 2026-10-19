import { describe, expect, it } from 'vitest';
import { mergeImportedJobs } from '../../src/timetable/import-merger.js';
import type { ImportedOccurrence, Job } from '../../src/core/types.js';

const base = (over: Partial<Job>): Job => ({
  id: 'tt:fvs:574-1:22413',
  enabled: true,
  source: 'timetable',
  origin: {
    faculty: 'fvs',
    group: '574-1',
    discipline: 'РМП2',
    sdoCourseId: '22413',
  },
  schedule: { type: 'imported', timezone: 'Asia/Tomsk', occurrences: [] },
  target: { type: 'search', courseId: '22413', courseName: 'РМП2' },
  browser: { headless: false },
  ...over,
});

const occ = (date: string, over = {}) => ({
  date,
  joinAt: '13:15',
  leaveAt: '14:50',
  ...over,
});

function occurrencesOf(job: Job): ImportedOccurrence[] {
  return job.schedule.type === 'imported' ? job.schedule.occurrences : [];
}

describe('mergeImportedJobs', () => {
  it('preserves an edited second occurrence when a date has two lessons', () => {
    const incoming = base({
      schedule: {
        type: 'imported',
        timezone: 'Asia/Tomsk',
        occurrences: [
          occ('2026-10-21', { joinAt: '10:00', leaveAt: '11:35' }),
          occ('2026-10-21', { joinAt: '12:00', leaveAt: '13:35' }),
        ],
      },
    });
    const existing = structuredClone(incoming);
    if (existing.schedule.type !== 'imported')
      throw new Error('Expected imported');
    existing.schedule.occurrences[1] = {
      ...existing.schedule.occurrences[1]!,
      joinAt: '12:05',
      leaveAt: '13:40',
      originalJoinAt: '12:00',
      edited: true,
    };
    const result = mergeImportedJobs([existing], [incoming]);
    expect(occurrencesOf(result.jobs[0]!)).toMatchObject([
      { joinAt: '10:00' },
      { joinAt: '12:05', originalJoinAt: '12:00', edited: true },
    ]);
  });

  it('suppresses only a discipline matching the manual title', () => {
    const manual: Job = {
      id: 'manual:physics',
      enabled: true,
      source: 'manual',
      title: ' физика ',
      schedule: {
        type: 'once',
        date: '2026-10-21',
        joinAt: '13:15',
        leaveAt: '14:50',
        timezone: 'Asia/Tomsk',
      },
      target: {
        type: 'direct',
        activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=8',
      },
      browser: { headless: false },
    };
    const physics = base({
      id: 'tt:physics',
      origin: {
        faculty: 'f',
        group: 'g',
        discipline: 'Физика',
        sdoCourseId: '1',
      },
      schedule: {
        type: 'imported',
        timezone: 'Asia/Tomsk',
        occurrences: [occ('2026-10-21')],
      },
    });
    const chemistry = base({
      id: 'tt:chemistry',
      origin: {
        faculty: 'f',
        group: 'g',
        discipline: 'Химия',
        sdoCourseId: '2',
      },
      schedule: {
        type: 'imported',
        timezone: 'Asia/Tomsk',
        occurrences: [occ('2026-10-21')],
      },
    });
    const result = mergeImportedJobs([manual], [physics, chemistry]);
    expect(
      occurrencesOf(result.jobs.find((job) => job.id === 'tt:physics')!)[0]
        ?.suppressed,
    ).toBe(true);
    expect(
      occurrencesOf(result.jobs.find((job) => job.id === 'tt:chemistry')!)[0]
        ?.suppressed,
    ).not.toBe(true);
  });

  it('adds new dates and removes vanished untouched dates', () => {
    const existing = [
      base({
        schedule: {
          type: 'imported',
          timezone: 'Asia/Tomsk',
          occurrences: [occ('2026-09-30')],
        },
      }),
    ];
    const imported = [
      base({
        schedule: {
          type: 'imported',
          timezone: 'Asia/Tomsk',
          occurrences: [occ('2026-10-07')],
        },
      }),
    ];
    const { jobs, summary } = mergeImportedJobs(existing, imported);
    expect(jobs[0]!.schedule).toMatchObject({
      occurrences: [occ('2026-10-07')],
    });
    expect(summary).toMatchObject({ added: 1, removed: 1 });
  });

  it('preserves edited occurrences and does not remove them', () => {
    const existing = [
      base({
        schedule: {
          type: 'imported',
          timezone: 'Asia/Tomsk',
          occurrences: [occ('2026-09-30', { joinAt: '15:00', edited: true })],
        },
      }),
    ];
    const { jobs, summary } = mergeImportedJobs(existing, []);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.schedule).toMatchObject({
      occurrences: [occ('2026-09-30', { joinAt: '15:00', edited: true })],
    });
    expect(summary.preservedEdits).toBe(1);
  });

  it('keeps an edited occurrence when imported contains the same date', () => {
    const existing = [
      base({
        schedule: {
          type: 'imported',
          timezone: 'Asia/Tomsk',
          occurrences: [
            {
              date: '2026-09-30',
              joinAt: '15:00',
              leaveAt: '16:30',
              edited: true,
            },
          ],
        },
      }),
    ];
    const imported = [
      base({
        schedule: {
          type: 'imported',
          timezone: 'Asia/Tomsk',
          occurrences: [
            { date: '2026-09-30', joinAt: '13:15', leaveAt: '14:50' },
          ],
        },
      }),
    ];
    const { jobs, summary } = mergeImportedJobs(existing, imported);
    const merged = occurrencesOf(jobs[0]!);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      date: '2026-09-30',
      joinAt: '15:00',
      leaveAt: '16:30',
      edited: true,
    });
    expect(summary.preservedEdits).toBe(1);
  });

  it('keeps suppressed occurrences suppressed after refresh', () => {
    const existing = [
      base({
        schedule: {
          type: 'imported',
          timezone: 'Asia/Tomsk',
          occurrences: [occ('2026-10-07', { suppressed: true })],
        },
      }),
    ];
    const imported = [
      base({
        schedule: {
          type: 'imported',
          timezone: 'Asia/Tomsk',
          occurrences: [occ('2026-10-07')],
        },
      }),
    ];
    const { jobs } = mergeImportedJobs(existing, imported);
    expect(occurrencesOf(jobs[0]!)[0]!.suppressed).toBe(true);
  });

  it('never modifies a manual job', () => {
    const manual: Job = {
      ...base({}),
      id: 'manual-1',
      source: 'manual',
      origin: undefined,
    };
    const { jobs } = mergeImportedJobs([manual], []);
    expect(jobs).toEqual([manual]);
  });

  it('deletes a timetable job when its discipline disappears', () => {
    const existing = [base({})];
    const { jobs, summary } = mergeImportedJobs(existing, []);
    expect(jobs).toEqual([]);
    expect(summary.jobsDeleted).toBe(1);
  });

  it('keeps an untouched timetable job when pruning is disabled', () => {
    const existing = [
      base({
        schedule: {
          type: 'imported',
          timezone: 'Asia/Tomsk',
          occurrences: [occ('2026-09-30')],
        },
      }),
    ];
    const { jobs, summary } = mergeImportedJobs(existing, [], { prune: false });
    expect(jobs).toEqual(existing);
    expect(summary.jobsDeleted).toBe(0);
  });

  it('suppresses an imported occurrence that duplicates a manual pair', () => {
    const manual: Job = {
      ...base({}),
      id: 'manual-rmp2',
      source: 'manual',
      origin: undefined,
      schedule: {
        type: 'once',
        date: '2026-09-30',
        joinAt: '13:15',
        leaveAt: '14:50',
        timezone: 'Asia/Tomsk',
      },
    };
    const imported = [
      base({
        schedule: {
          type: 'imported',
          timezone: 'Asia/Tomsk',
          occurrences: [occ('2026-09-30')],
        },
      }),
    ];
    const { jobs } = mergeImportedJobs([manual], imported);
    const importedJob = jobs.find((j) => j.source === 'timetable')!;
    expect(occurrencesOf(importedJob)[0]!.suppressed).toBe(true);
  });

  it('keeps an existing occurrence absent from the import when pruning is disabled', () => {
    const existing = [
      base({
        schedule: {
          type: 'imported',
          timezone: 'Asia/Tomsk',
          occurrences: [occ('2026-09-30')],
        },
      }),
    ];
    const imported = [
      base({
        schedule: {
          type: 'imported',
          timezone: 'Asia/Tomsk',
          occurrences: [occ('2026-10-07')],
        },
      }),
    ];
    const { jobs, summary } = mergeImportedJobs(existing, imported, {
      prune: false,
    });
    expect(
      occurrencesOf(jobs[0]!).map((occurrence) => occurrence.date),
    ).toEqual(['2026-10-07', '2026-09-30']);
    expect(summary.removed).toBe(0);
  });

  it('takes the freshly resolved target when merging a matched job', () => {
    const existing = [
      base({
        target: {
          type: 'direct',
          activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=1',
        },
      }),
    ];
    const imported = [
      base({
        target: {
          type: 'direct',
          activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=2',
        },
      }),
    ];
    const { jobs } = mergeImportedJobs(existing, imported);
    expect(jobs[0]!.target).toEqual({
      type: 'direct',
      activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=2',
    });
  });

  it('suppresses an occurrence matching a direct-target manual job with unknown discipline', () => {
    const manual: Job = {
      id: 'manual-direct',
      enabled: true,
      source: 'manual',
      schedule: {
        type: 'once',
        date: '2026-09-30',
        joinAt: '13:15',
        leaveAt: '14:50',
        timezone: 'Asia/Tomsk',
      },
      target: {
        type: 'direct',
        activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=9',
      },
      browser: { headless: false },
    };
    const imported = [
      base({
        schedule: {
          type: 'imported',
          timezone: 'Asia/Tomsk',
          occurrences: [occ('2026-09-30')],
        },
      }),
    ];
    const { jobs } = mergeImportedJobs([manual], imported);
    const importedJob = jobs.find((job) => job.source === 'timetable')!;
    expect(occurrencesOf(importedJob)[0]!.suppressed).toBe(true);
  });

  it('suppresses an imported occurrence that matches a manual weekly job', () => {
    const manual: Job = {
      ...base({}),
      id: 'manual-weekly',
      source: 'manual',
      origin: undefined,
      schedule: {
        type: 'weekly',
        days: ['wed'],
        joinAt: '13:15',
        leaveAt: '14:50',
        timezone: 'Asia/Tomsk',
      },
    };
    const imported = [
      base({
        schedule: {
          type: 'imported',
          timezone: 'Asia/Tomsk',
          occurrences: [occ('2026-09-30')],
        },
      }),
    ];
    const { jobs } = mergeImportedJobs([manual], imported);
    const importedJob = jobs.find((j) => j.source === 'timetable')!;
    expect(occurrencesOf(importedJob)[0]!.suppressed).toBe(true);
  });
});
