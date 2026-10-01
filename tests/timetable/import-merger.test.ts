import { describe, expect, it } from 'vitest';
import { mergeImportedJobs } from '../../src/timetable/import-merger.js';
import type { Job } from '../../src/core/types.js';

const base = (over: Partial<Job>): Job => ({
  id: 'tt:fvs:574-1:22413',
  enabled: true,
  source: 'timetable',
  origin: { faculty: 'fvs', group: '574-1', discipline: 'РМП2', sdoCourseId: '22413' },
  schedule: { type: 'imported', timezone: 'Asia/Tomsk', occurrences: [] },
  target: { type: 'search', courseId: '22413', courseName: 'РМП2' },
  browser: { headless: false },
  ...over,
});

const occ = (date: string, over = {}) => ({ date, joinAt: '13:15', leaveAt: '14:50', ...over });

describe('mergeImportedJobs', () => {
  it('adds new dates and removes vanished untouched dates', () => {
    const existing = [base({ schedule: { type: 'imported', timezone: 'Asia/Tomsk', occurrences: [occ('2026-09-30')] } })];
    const imported = [base({ schedule: { type: 'imported', timezone: 'Asia/Tomsk', occurrences: [occ('2026-10-07')] } })];
    const { jobs, summary } = mergeImportedJobs(existing, imported);
    expect(jobs[0]!.schedule).toMatchObject({ occurrences: [occ('2026-10-07')] });
    expect(summary).toMatchObject({ added: 1, removed: 1 });
  });

  it('preserves edited occurrences and does not remove them', () => {
    const existing = [base({ schedule: { type: 'imported', timezone: 'Asia/Tomsk', occurrences: [occ('2026-09-30', { joinAt: '15:00', edited: true })] } })];
    const { jobs, summary } = mergeImportedJobs(existing, []);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.schedule).toMatchObject({ occurrences: [occ('2026-09-30', { joinAt: '15:00', edited: true })] });
    expect(summary.preservedEdits).toBe(1);
  });

  it('keeps suppressed occurrences suppressed after refresh', () => {
    const existing = [base({ schedule: { type: 'imported', timezone: 'Asia/Tomsk', occurrences: [occ('2026-10-07', { suppressed: true })] } })];
    const imported = [base({ schedule: { type: 'imported', timezone: 'Asia/Tomsk', occurrences: [occ('2026-10-07')] } })];
    const { jobs } = mergeImportedJobs(existing, imported);
    expect((jobs[0]!.schedule as any).occurrences[0].suppressed).toBe(true);
  });

  it('never modifies a manual job', () => {
    const manual: Job = { ...base({}), id: 'manual-1', source: 'manual', origin: undefined };
    const { jobs } = mergeImportedJobs([manual], []);
    expect(jobs).toEqual([manual]);
  });

  it('deletes a timetable job when its discipline disappears', () => {
    const existing = [base({})];
    const { jobs, summary } = mergeImportedJobs(existing, []);
    expect(jobs).toEqual([]);
    expect(summary.jobsDeleted).toBe(1);
  });

  it('suppresses an imported occurrence that duplicates a manual pair', () => {
    const manual: Job = {
      ...base({}),
      id: 'manual-rmp2',
      source: 'manual',
      origin: undefined,
      schedule: { type: 'once', date: '2026-09-30', joinAt: '13:15', leaveAt: '14:50', timezone: 'Asia/Tomsk' },
    };
    const imported = [base({ schedule: { type: 'imported', timezone: 'Asia/Tomsk', occurrences: [occ('2026-09-30')] } })];
    const { jobs } = mergeImportedJobs([manual], imported);
    const importedJob = jobs.find((j) => j.source === 'timetable')!;
    expect((importedJob.schedule as any).occurrences[0].suppressed).toBe(true);
  });
});
