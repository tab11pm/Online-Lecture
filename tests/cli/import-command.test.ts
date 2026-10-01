import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { executeCli } from '../../src/cli/commands.js';
import { SqliteStore } from '../../src/persistence/sqlite-store.js';
import { SqliteJobRepository } from '../../src/persistence/job-repository.js';

const home = '<a href="/faculties/fvs/groups/574-1">Мое расписание</a>';
const week =
  '<table><tbody><tr><td>ср, 30 сент.</td><td><span>13:15</span><span>14:50</span><div class="training training_type_lecture"><span class="discipline" data-lesson-id="1">РВП</span><span class="kind">Лекция</span><span class="note">реализуется в ЭИОС</span></div></td></tr></tbody></table>';

describe('cli import', () => {
  it('imports online lectures into the database', async () => {
    const db = join(mkdtempSync(join(tmpdir(), 'ol-')), 'lectures.db');
    const routes: Record<string, string> = {
      '/': home,
      '/faculties/fvs/groups/574-1': '<a href="?week_id=839"></a>',
      '/ocenka/api/v1/lessons/1/course_links':
        '[{"url":"https://sdo.tusur.ru/auth/edu?id=22414","anchor":"a","group":"574-1"}]',
      '/faculties/fvs/groups/574-1?week_id=839': week,
    };
    const result = await executeCli(['import', '--db', db], {
      createFetcher: async () => ({
        get: async (url) => {
          const u = new URL(url);
          return routes[u.pathname + u.search] ?? routes[u.pathname] ?? '';
        },
      }),
      createResolver: async () => ({
        resolveOnlineLecture: async () => ({
          status: 'resolved',
          course: { id: '22414', name: 'РВП' },
          module: {
            id: 'm',
            name: 'Онлайн-лекция',
            courseUrl: 'https://sdo.tusur.ru/course/view.php?id=22414',
            activityUrl:
              'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=1',
            type: 'lecture',
          },
        }),
      }),
    });
    expect(result.exitCode).toBe(0);
    const store = new SqliteStore(db);
    await store.open();
    const jobs = await new SqliteJobRepository(store).listAll();
    expect(jobs.map((j) => j.id)).toEqual(['tt:fvs:574-1:22414']);
    store.close();
  });

  it('leaves the database unchanged when fetching fails', async () => {
    const db = join(mkdtempSync(join(tmpdir(), 'ol-')), 'lectures.db');
    const store = new SqliteStore(db);
    await store.open();
    await new SqliteJobRepository(store).save({
      id: 'manual-1',
      enabled: true,
      source: 'manual',
      schedule: {
        type: 'once',
        date: '2026-09-30',
        joinAt: '13:15',
        leaveAt: '14:50',
        timezone: 'Asia/Tomsk',
      },
      target: { type: 'search', courseId: 'x' },
      browser: { headless: false },
    });
    store.close();

    const result = await executeCli(['import', '--db', db], {
      createFetcher: async () => ({
        get: async () => {
          throw new Error('network down');
        },
      }),
      createResolver: async () => ({
        resolveOnlineLecture: async () => ({ status: 'not_found' }),
      }),
    });
    expect(result.exitCode).toBe(1);

    const reopened = new SqliteStore(db);
    await reopened.open();
    const jobs = await new SqliteJobRepository(reopened).listAll();
    expect(jobs.map((j) => j.id)).toEqual(['manual-1']);
    reopened.close();
  });

  it('keeps saved timetable jobs when the resolver requires authentication', async () => {
    const db = join(mkdtempSync(join(tmpdir(), 'ol-')), 'lectures.db');
    const store = new SqliteStore(db);
    await store.open();
    await new SqliteJobRepository(store).save({
      id: 'tt:fvs:574-1:22414',
      enabled: true,
      source: 'timetable',
      origin: {
        faculty: 'fvs',
        group: '574-1',
        discipline: 'РВП',
        sdoCourseId: '22414',
      },
      schedule: {
        type: 'imported',
        timezone: 'Asia/Tomsk',
        occurrences: [
          { date: '2026-09-30', joinAt: '13:15', leaveAt: '14:50' },
        ],
      },
      target: { type: 'search', courseId: '22414', courseName: 'РВП' },
      browser: { headless: false },
    });
    store.close();

    const routes: Record<string, string> = {
      '/': home,
      '/faculties/fvs/groups/574-1': '<a href="?week_id=839"></a>',
      '/ocenka/api/v1/lessons/1/course_links':
        '[{"url":"https://sdo.tusur.ru/auth/edu?id=22414","anchor":"a","group":"574-1"}]',
      '/faculties/fvs/groups/574-1?week_id=839': week,
    };
    const result = await executeCli(['import', '--db', db], {
      createFetcher: async () => ({
        get: async (url) => {
          const u = new URL(url);
          return routes[u.pathname + u.search] ?? routes[u.pathname] ?? '';
        },
      }),
      createResolver: async () => ({
        resolveOnlineLecture: async () => ({ status: 'auth_required' }),
      }),
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toBe(
      'Authentication required for SDO; no changes applied\n',
    );

    const reopened = new SqliteStore(db);
    await reopened.open();
    const jobs = await new SqliteJobRepository(reopened).listAll();
    expect(jobs.map((j) => j.id)).toEqual(['tt:fvs:574-1:22414']);
    reopened.close();
  });

  it('does not prune saved timetable jobs on a partial import', async () => {
    const db = join(mkdtempSync(join(tmpdir(), 'ol-')), 'lectures.db');
    const store = new SqliteStore(db);
    await store.open();
    await new SqliteJobRepository(store).save({
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
        occurrences: [
          { date: '2026-09-30', joinAt: '13:15', leaveAt: '14:50' },
        ],
      },
      target: { type: 'search', courseId: '99999', courseName: 'Старая' },
      browser: { headless: false },
    });
    store.close();

    const routes: Record<string, string> = {
      '/': home,
      '/faculties/fvs/groups/574-1': '<a href="?week_id=839"></a>',
      '/ocenka/api/v1/lessons/1/course_links':
        '[{"url":"https://sdo.tusur.ru/auth/edu?id=22414","anchor":"a","group":"574-1"}]',
      '/faculties/fvs/groups/574-1?week_id=839': week,
    };
    const result = await executeCli(['import', '--db', db], {
      createFetcher: async () => ({
        get: async (url) => {
          const u = new URL(url);
          return routes[u.pathname + u.search] ?? routes[u.pathname] ?? '';
        },
      }),
      createResolver: async () => ({
        resolveOnlineLecture: async () => ({
          status: 'ambiguous',
          candidates: [],
        }),
      }),
    });
    expect(result.exitCode).toBe(0);

    const reopened = new SqliteStore(db);
    await reopened.open();
    const jobs = await new SqliteJobRepository(reopened).listAll();
    expect(jobs.map((j) => j.id)).toEqual(['tt:fvs:574-1:99999']);
    reopened.close();
  });
});
