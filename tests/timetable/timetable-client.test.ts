import { describe, expect, it } from 'vitest';
import { TimetableClient } from '../../src/timetable/timetable-client.js';
import type { HttpFetcher } from '../../src/timetable/http-fetcher.js';

function fetcher(routes: Record<string, string>): HttpFetcher {
  return {
    get: async (url) => routes[url] ?? routes[new URL(url).pathname] ?? '',
  };
}

describe('TimetableClient', () => {
  it('discovers faculty and group from the authenticated home page', async () => {
    const client = new TimetableClient({
      fetcher: fetcher({
        '/': '<a href="/faculties/fvs/groups/574-1">Мое расписание</a>',
      }),
      baseUrl: 'https://timetable.tusur.ru',
      year: 2026,
    });
    await expect(client.discoverGroup()).resolves.toEqual({
      faculty: 'fvs',
      group: '574-1',
    });
  });

  it('collects only online lessons across weeks and deduplicates by lessonId', async () => {
    const client = new TimetableClient({
      fetcher: fetcher({
        '/faculties/fvs/groups/574-1':
          '<a href="?week_id=839"></a><a href="?week_id=840"></a>',
        '/faculties/fvs/groups/574-1?week_id=839':
          '<table><tbody><tr><td>ср, 30 сент.</td><td><span>13:15</span><span>14:50</span><div class="training training_type_lecture"><span class="discipline" data-lesson-id="9">РВП</span><span class="kind">Лекция</span><span class="note">реализуется в ЭИОС</span></div></td></tr></tbody></table>',
        '/faculties/fvs/groups/574-1?week_id=840':
          '<table><tbody><tr><td>пн, 05 окт.</td><td><span>13:15</span><span>14:50</span><div class="training training_type_lecture"><span class="discipline" data-lesson-id="9">РВП</span><span class="kind">Лекция</span><span class="note">реализуется в ЭИОС</span></div></td></tr></tbody></table>',
      }),
      baseUrl: 'https://timetable.tusur.ru',
      year: 2026,
    });
    const lessons = await client.fetchOnlineLessons('fvs', '574-1');
    expect(lessons.map((l) => l.lessonId)).toEqual(['9']);
  });

  it('parses course links for a lesson', async () => {
    const client = new TimetableClient({
      fetcher: fetcher({
        '/ocenka/api/v1/lessons/9/course_links':
          '[{"url":"https://sdo.tusur.ru/auth/edu?id=22414","anchor":"a","group":"574-1"}]',
      }),
      baseUrl: 'https://timetable.tusur.ru',
      year: 2026,
    });
    await expect(client.fetchCourseLinks('9')).resolves.toHaveLength(1);
  });
});
