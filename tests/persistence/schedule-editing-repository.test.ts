import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteJobRepository } from '../../src/persistence/job-repository.js';
import { SqliteRunRepository } from '../../src/persistence/run-repository.js';
import { SqliteStore } from '../../src/persistence/sqlite-store.js';
import type { Job, Run } from '../../src/core/types.js';

const NOW = new Date('2026-10-20T03:00:00.000Z');
const ZONE = 'Asia/Krasnoyarsk';
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'schedule-edit-repo-'));
  directories.push(directory);
  const store = new SqliteStore(join(directory, 'lectures.db'));
  await store.open();
  return {
    store,
    jobs: new SqliteJobRepository(store),
    runs: new SqliteRunRepository(store),
  };
}

function imported(id = 'tt:physics', discipline = 'Физика'): Job {
  return {
    id,
    enabled: true,
    source: 'timetable',
    origin: { faculty: 'f', group: 'g', discipline, sdoCourseId: id },
    schedule: {
      type: 'imported',
      timezone: ZONE,
      occurrences: [{ date: '2026-10-21', joinAt: '10:00', leaveAt: '11:35' }],
    },
    target: { type: 'search', courseId: id, courseName: discipline },
    browser: { headless: false },
  };
}

function manual(id = 'manual:one', title = 'Физика'): Job {
  return {
    id,
    enabled: true,
    source: 'manual',
    title,
    schedule: {
      type: 'once',
      date: '2026-10-21',
      joinAt: '10:00',
      leaveAt: '11:35',
      timezone: ZONE,
    },
    target: {
      type: 'direct',
      activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=7',
    },
    browser: { headless: false },
  };
}

function occurrenceId(jobId: string): string {
  return `${jobId}:2026-10-21T10:00:00.000+07:00`;
}

function run(jobId: string, status: Run['status']): Run {
  return {
    jobId,
    occurrenceId: occurrenceId(jobId),
    status,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

describe('SqliteJobRepository schedule editing', () => {
  it('rejects an edit after a run started or join time arrived', async () => {
    const { store, jobs, runs } = await setup();
    await jobs.save(imported());
    await runs.getOrCreate(run('tt:physics', 'scheduled'));
    await runs.claimScheduled(
      'tt:physics',
      occurrenceId('tt:physics'),
      NOW.toISOString(),
    );
    const input = {
      jobId: 'tt:physics',
      date: '2026-10-21',
      joinAt: '12:00',
      leaveAt: '13:35',
    };
    await expect(jobs.editImportedTime(input, NOW)).rejects.toThrow();
    expect((await jobs.getById('tt:physics'))?.schedule).toMatchObject({
      occurrences: [{ joinAt: '10:00' }],
    });
    store.close();

    const later = await setup();
    await later.jobs.save(imported());
    await expect(
      later.jobs.editImportedTime(input, new Date('2026-10-21T03:00:00.000Z')),
    ).rejects.toThrow();
    later.store.close();
  });

  it('allows an untouched scheduled row and keeps that row from launching again', async () => {
    const { store, jobs, runs } = await setup();
    await jobs.save(imported());
    await runs.getOrCreate(run('tt:physics', 'scheduled'));
    await jobs.editImportedTime(
      {
        jobId: 'tt:physics',
        date: '2026-10-21',
        joinAt: '12:00',
        leaveAt: '13:35',
      },
      NOW,
    );
    expect((await jobs.getById('tt:physics'))?.schedule).toMatchObject({
      occurrences: [{ joinAt: '12:00', edited: true }],
    });
    expect((await runs.listAll()).map((entry) => entry.occurrenceId)).toEqual([
      occurrenceId('tt:physics'),
    ]);
    store.close();
  });

  it('moves and cancels linked jobs atomically and rejects a second move', async () => {
    const { store, jobs } = await setup();
    await jobs.save(imported());
    const input = {
      jobId: 'tt:physics',
      date: '2026-10-21',
      newDate: '2026-10-24',
      newJoinAt: '12:00',
      newLeaveAt: '13:35',
    };
    const id = await jobs.reschedule(input, NOW);
    await expect(jobs.reschedule(input, NOW)).rejects.toThrow();
    expect((await jobs.listAll()).map((job) => job.id)).toEqual([
      id,
      'tt:physics',
    ]);
    expect((await jobs.getById('tt:physics'))?.schedule).toMatchObject({
      occurrences: [{ suppressed: true }],
    });
    await jobs.cancelReschedule(id, NOW);
    expect(await jobs.getById(id)).toBeUndefined();
    expect((await jobs.getById('tt:physics'))?.schedule).toMatchObject({
      occurrences: [{ suppressed: false }],
    });
    store.close();
  });

  it('rejects a move into a matching active imported slot', async () => {
    const { store, jobs } = await setup();
    await jobs.save(imported());
    const destination = imported('tt:other');
    if (destination.schedule.type !== 'imported')
      throw new Error('Expected imported');
    destination.schedule.occurrences[0] = {
      date: '2026-10-24',
      joinAt: '12:00',
      leaveAt: '13:35',
    };
    await jobs.save(destination);
    await expect(
      jobs.reschedule(
        {
          jobId: 'tt:physics',
          date: '2026-10-21',
          newDate: '2026-10-24',
          newJoinAt: '12:00',
          newLeaveAt: '13:35',
        },
        NOW,
      ),
    ).rejects.toThrow();
    const source = await jobs.getById('tt:physics');
    expect(
      source?.schedule.type === 'imported' &&
        source.schedule.occurrences[0]?.suppressed,
    ).toBeFalsy();
    store.close();
  });

  it('rejects cancellation that would collide with another manual pair', async () => {
    const { store, jobs } = await setup();
    await jobs.save(imported());
    const moved = await jobs.reschedule(
      {
        jobId: 'tt:physics',
        date: '2026-10-21',
        newDate: '2026-10-24',
        newJoinAt: '12:00',
        newLeaveAt: '13:35',
      },
      NOW,
    );
    await jobs.saveManual(manual(), NOW);
    await expect(jobs.cancelReschedule(moved, NOW)).rejects.toThrow();
    expect((await jobs.getById('tt:physics'))?.schedule).toMatchObject({
      occurrences: [{ suppressed: true }],
    });
    store.close();
  });

  it('saves a manual job and suppresses only an imported duplicate', async () => {
    const { store, jobs } = await setup();
    await jobs.save(imported());
    await jobs.save(imported('tt:chemistry', 'Химия'));
    await jobs.saveManual(manual(), NOW);
    await expect(jobs.saveManual(manual('manual:two'), NOW)).rejects.toThrow();
    expect((await jobs.getById('tt:physics'))?.schedule).toMatchObject({
      occurrences: [{ suppressed: true }],
    });
    const chemistry = await jobs.getById('tt:chemistry');
    expect(
      chemistry?.schedule.type === 'imported' &&
        chemistry.schedule.occurrences[0]?.suppressed,
    ).toBeUndefined();
    store.close();
  });

  it('suppresses an edited imported occurrence when a manual pair duplicates it', async () => {
    const { store, jobs } = await setup();
    const source = imported();
    if (source.schedule.type !== 'imported')
      throw new Error('Expected imported schedule');
    source.schedule.occurrences[0] = {
      ...source.schedule.occurrences[0]!,
      joinAt: '12:00',
      leaveAt: '13:35',
      edited: true,
    };
    await jobs.save(source);
    const sameTime = manual();
    if (sameTime.schedule.type !== 'once') throw new Error('Expected once');
    sameTime.schedule.joinAt = '12:00';
    sameTime.schedule.leaveAt = '13:35';
    await jobs.saveManual(sameTime, NOW);
    await jobs.mergeTimetableJobs([imported()], true);
    expect((await jobs.getById('tt:physics'))?.schedule).toMatchObject({
      occurrences: [{ edited: true, suppressed: true }],
    });
    store.close();
  });

  it('does not suppress an edited time merely because a manual pair matches the original time', async () => {
    const { store, jobs } = await setup();
    const source = imported();
    if (source.schedule.type !== 'imported')
      throw new Error('Expected imported schedule');
    source.schedule.occurrences[0] = {
      ...source.schedule.occurrences[0]!,
      joinAt: '12:00',
      leaveAt: '13:35',
      edited: true,
    };
    await jobs.save(source);
    await jobs.saveManual(manual(), NOW);
    await jobs.mergeTimetableJobs([imported()], true);
    const saved = await jobs.getById('tt:physics');
    expect(
      saved?.schedule.type === 'imported' && saved.schedule.occurrences[0],
    ).toMatchObject({ joinAt: '12:00', edited: true });
    expect(
      saved?.schedule.type === 'imported' &&
        saved.schedule.occurrences[0]?.suppressed,
    ).toBeFalsy();
    store.close();
  });

  it('merges import against the latest edited row and leaves manual jobs untouched', async () => {
    const { store, jobs } = await setup();
    await jobs.save(imported());
    await jobs.save(manual());
    const fetchedEarlier = imported();
    await jobs.editImportedTime(
      {
        jobId: 'tt:physics',
        date: '2026-10-21',
        joinAt: '12:00',
        leaveAt: '13:35',
      },
      NOW,
    );
    await jobs.mergeTimetableJobs([fetchedEarlier], true);
    expect((await jobs.getById('tt:physics'))?.schedule).toMatchObject({
      occurrences: [{ joinAt: '12:00', edited: true }],
    });
    expect(await jobs.getById('manual:one')).toEqual(manual());
    store.close();
  });

  it('deletes a manual job without deleting its run history', async () => {
    const { store, jobs, runs } = await setup();
    await jobs.save(manual());
    await runs.getOrCreate(run('manual:one', 'completed'));
    await jobs.deleteManual('manual:one');
    expect(await jobs.getById('manual:one')).toBeUndefined();
    expect(await runs.listAll()).toHaveLength(1);
    store.close();
  });
});
