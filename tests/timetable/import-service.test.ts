import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { Job, OnlineLectureResolver } from '../../src/core/types.js';
import { SqliteJobRepository } from '../../src/persistence/job-repository.js';
import { SqliteStore } from '../../src/persistence/sqlite-store.js';
import type { HttpFetcher } from '../../src/timetable/http-fetcher.js';
import {
  LAST_IMPORT_KEY,
  runTimetableImport,
  type ImportStage,
  type TimetableImportDependencies,
} from '../../src/timetable/import-service.js';

const home = '<a href="/faculties/fvs/groups/574-1">Мое расписание</a>';
const week =
  '<table><tbody><tr><td>ср, 30 сент.</td><td><span>13:15</span><span>14:50</span><div class="training training_type_lecture"><span class="discipline" data-lesson-id="1">РВП</span><span class="kind">Лекция</span><span class="note">реализуется в ЭИОС</span></div></td></tr></tbody></table>';

const resolved: Awaited<
  ReturnType<OnlineLectureResolver['resolveOnlineLecture']>
> = {
  status: 'resolved',
  course: { id: '22414', name: 'РВП' },
  module: {
    id: 'm',
    name: 'Онлайн-лекция',
    courseUrl: 'https://sdo.tusur.ru/course/view.php?id=22414',
    activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=1',
    type: 'lecture',
  },
};

function fetcherFor(overrides: Record<string, string> = {}): HttpFetcher {
  const routes: Record<string, string> = {
    '/': home,
    '/faculties/fvs/groups/574-1': '<a href="?week_id=839"></a>',
    '/ocenka/api/v1/lessons/1/course_links':
      '[{"url":"https://sdo.tusur.ru/auth/edu?id=22414","anchor":"a","group":"574-1"}]',
    '/faculties/fvs/groups/574-1?week_id=839': week,
    ...overrides,
  };
  return {
    get: async (url) => {
      const u = new URL(url);
      return routes[u.pathname + u.search] ?? routes[u.pathname] ?? '';
    },
  };
}

const staleJob: Job = {
  id: 'tt:fvs:574-1:99999',
  enabled: true,
  source: 'timetable',
  origin: {
    faculty: 'fvs',
    group: '574-1',
    discipline: 'Старая',
    sdoCourseId: '99999',
  },
  schedule: {
    type: 'imported',
    timezone: 'Asia/Tomsk',
    occurrences: [{ date: '2026-09-30', joinAt: '13:15', leaveAt: '14:50' }],
  },
  target: { type: 'search', courseId: '99999', courseName: 'Старая' },
  browser: { headless: false },
};

async function setup(
  resolve: OnlineLectureResolver['resolveOnlineLecture'],
  fetcher: HttpFetcher = fetcherFor(),
) {
  const store = new SqliteStore(
    join(mkdtempSync(join(tmpdir(), 'ol-')), 'lectures.db'),
  );
  await store.open();
  const repository = new SqliteJobRepository(store);
  await repository.save(staleJob);
  const mergeTimetableJobs = vi.fn((jobs: Job[], prune: boolean) =>
    repository.mergeTimetableJobs(jobs, prune),
  );
  const deps: TimetableImportDependencies = {
    fetcher,
    resolver: { resolveOnlineLecture: resolve },
    jobs: { mergeTimetableJobs },
    now: () => new Date('2026-10-01T00:00:00Z'),
  };
  return { store, repository, deps, mergeTimetableJobs };
}

describe('runTimetableImport', () => {
  it('exposes the last import meta key', () => {
    expect(LAST_IMPORT_KEY).toBe('timetable.lastImportAt');
  });

  it('reports stages in order', async () => {
    const { deps, store } = await setup(async () => resolved);
    const stages: ImportStage[] = [];
    const result = await runTimetableImport(deps, {
      onProgress: (stage) => stages.push(stage),
    });
    expect(result.status).toBe('completed');
    expect(stages).toEqual([
      'group',
      'schedule',
      'courses',
      'lectures',
      'saving',
    ]);
    store.close();
  });

  it('prunes only on a complete import', async () => {
    const { deps, repository, store } = await setup(async () => resolved);
    const result = await runTimetableImport(deps);
    expect(result).toMatchObject({
      status: 'completed',
      faculty: 'fvs',
      group: '574-1',
      lessons: 1,
      complete: true,
      unresolved: [],
      ambiguous: [],
      unmapped: [],
    });
    expect((await repository.listAll()).map((job) => job.id)).toEqual([
      'tt:fvs:574-1:22414',
    ]);
    store.close();
  });

  it('keeps existing jobs on a partial import', async () => {
    const { deps, repository, store } = await setup(async () => ({
      status: 'not_found',
    }));
    const result = await runTimetableImport(deps);
    expect(result).toMatchObject({
      status: 'completed',
      complete: false,
      unresolved: ['РВП'],
    });
    expect((await repository.listAll()).map((job) => job.id)).toEqual([
      staleJob.id,
    ]);
    store.close();
  });

  it('reports lessons without course links as unmapped and keeps jobs', async () => {
    const { deps, repository, store } = await setup(
      async () => resolved,
      fetcherFor({ '/ocenka/api/v1/lessons/1/course_links': '[]' }),
    );
    const result = await runTimetableImport(deps);
    expect(result).toMatchObject({
      status: 'completed',
      complete: false,
      unmapped: ['РВП'],
    });
    expect((await repository.listAll()).map((job) => job.id)).toContain(
      staleJob.id,
    );
    store.close();
  });

  it('does not write on auth_required', async () => {
    const { deps, mergeTimetableJobs, store } = await setup(async () => ({
      status: 'auth_required',
    }));
    expect(await runTimetableImport(deps)).toEqual({ status: 'auth_required' });
    expect(mergeTimetableJobs).not.toHaveBeenCalled();
    store.close();
  });

  it('does not write on failure', async () => {
    const { deps, mergeTimetableJobs, store } = await setup(
      async () => resolved,
      {
        get: async () => {
          throw new Error('GET https://timetable.tusur.ru/x failed');
        },
      },
    );
    const result = await runTimetableImport(deps);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.message).not.toContain('https://');
    }
    expect(mergeTimetableJobs).not.toHaveBeenCalled();
    store.close();
  });

  it('does not write when no online lessons', async () => {
    const { deps, mergeTimetableJobs, store } = await setup(
      async () => resolved,
      fetcherFor({
        '/faculties/fvs/groups/574-1?week_id=839':
          '<table><tbody><tr><td>пн, 28 сент.</td><td><span>08:50</span><span>10:25</span></td></tr></tbody></table>',
      }),
    );
    const result = await runTimetableImport(deps);
    expect(result).toMatchObject({ status: 'completed', lessons: 0 });
    expect(mergeTimetableJobs).not.toHaveBeenCalled();
    store.close();
  });

  it('keeps an edit saved while the MCP lookup is still running', async () => {
    const reference: { current?: SqliteJobRepository } = {};
    const {
      deps,
      repository: jobs,
      store,
    } = await setup(async () => {
      await reference.current!.editImportedTime(
        {
          jobId: 'tt:fvs:574-1:22414',
          date: '2026-09-30',
          joinAt: '15:00',
          leaveAt: '16:30',
        },
        new Date('2026-09-29T00:00:00Z'),
      );
      return resolved;
    });
    reference.current = jobs;
    deps.now = () => new Date('2026-09-29T00:00:00Z');
    await jobs.save({
      ...staleJob,
      id: 'tt:fvs:574-1:22414',
      origin: { ...staleJob.origin!, discipline: 'РВП', sdoCourseId: '22414' },
    });
    expect((await runTimetableImport(deps)).status).toBe('completed');
    expect((await jobs.getById('tt:fvs:574-1:22414'))?.schedule).toMatchObject({
      occurrences: [{ date: '2026-09-30', joinAt: '15:00', edited: true }],
    });
    store.close();
  });
});
