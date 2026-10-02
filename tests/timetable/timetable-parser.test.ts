import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  discoverMyScheduleHref,
  parseFacultyAndGroup,
  parseLessons,
  parseWeekIds,
  ScheduleParseError,
} from '../../src/timetable/timetable-parser.js';

const home = readFileSync('tests/fixtures/timetable/home.html', 'utf8');
const week = readFileSync('tests/fixtures/timetable/group-week.html', 'utf8');

describe('timetable parser', () => {
  it('finds the personal schedule link and splits faculty and group', () => {
    const href = discoverMyScheduleHref(home);
    expect(href).toBe('http://timetable.tusur.ru/faculties/fvs/groups/574-1');
    expect(parseFacultyAndGroup(href!)).toEqual({
      faculty: 'fvs',
      group: '574-1',
    });
  });

  it('collects unique sorted week ids', () => {
    expect(
      parseWeekIds(
        '<a href="/fvs/groups/574-1?week_id=841"></a><a href="/fvs/groups/574-1?week_id=839"></a><a href="/fvs/groups/574-1?week_id=839"></a>',
      ),
    ).toEqual([839, 841]);
  });

  it('parses lessons and uses the full discipline name, not the abbreviation', () => {
    const lessons = parseLessons(week, { year: 2026 });
    expect(lessons).toHaveLength(2);
    expect(lessons[0]).toMatchObject({
      lessonId: '1',
      discipline: 'Правовые основы профессиональной деятельности',
      kind: 'Лекция',
      date: '2026-09-28',
      start: '13:15',
      end: '14:50',
      room: 'гк 411',
      online: false,
    });
    expect(lessons[1]).toMatchObject({
      lessonId: '2',
      date: '2026-09-30',
      online: true,
    });
  });

  it('detects online lessons from the EIOS tooltip attribute', () => {
    const html =
      '<table><tbody><tr><td>ср, 30 сент.</td><td><span>13:15</span><span>14:50</span>' +
      '<div class="training training_type_lecture">' +
      '<span class="fa fa-info-circle note" title="реализуется в ЭИОС"></span>' +
      '<span class="discipline" data-lesson-id="9">' +
      '<abbr title="Разработка мобильных приложений-2">РМП2</abbr></span>' +
      '<span class="kind">Лекция</span><span class="auditoriums"></span>' +
      '</div></td></tr></tbody></table>';

    const lessons = parseLessons(html, { year: 2026 });

    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({
      lessonId: '9',
      discipline: 'Разработка мобильных приложений-2',
      kind: 'Лекция',
      date: '2026-09-30',
      start: '13:15',
      end: '14:50',
      online: true,
    });
    expect(lessons[0]!.room).toBeUndefined();
  });

  it('detects EIOS and full discipline when the browser moved title to data-original-title', () => {
    const html =
      '<table><tbody><tr><td>ср, 30 сент.</td><td><span>13:15</span><span>14:50</span>' +
      '<div class="training training_type_lecture">' +
      '<span class="fa fa-info-circle note" title="" data-original-title="реализуется в ЭИОС"></span>' +
      '<span class="discipline" data-lesson-id="9">' +
      '<abbr title="" data-original-title="Разработка мобильных приложений-2">РМП2</abbr></span>' +
      '<span class="kind">Лекция</span><span class="auditoriums"></span>' +
      '</div></td></tr></tbody></table>';

    const lessons = parseLessons(html, { year: 2026 });

    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({
      lessonId: '9',
      discipline: 'Разработка мобильных приложений-2',
      online: true,
    });
  });

  it('reads times from the preceding slot cell when the lesson cell has none', () => {
    const html =
      '<table><tbody><tr><td>ср, 30 сент.</td>' +
      '<td><span>13:15</span><span>14:50</span></td>' +
      '<td><div class="training training_type_lecture">' +
      '<span class="discipline" data-lesson-id="9">РВП</span>' +
      '<span class="kind">Лекция</span>' +
      '<span class="fa note" title="реализуется в ЭИОС"></span>' +
      '</div></td></tr></tbody></table>';

    const lessons = parseLessons(html, { year: 2026 });

    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({
      lessonId: '9',
      start: '13:15',
      end: '14:50',
      online: true,
    });
  });

  it('throws when the schedule table is absent', () => {
    expect(() =>
      parseLessons('<html><body><h1>Ошибка</h1></body></html>', {
        year: 2026,
      }),
    ).toThrow(ScheduleParseError);
  });

  it('returns an empty list for a week with day headers but no lessons', () => {
    const html =
      '<table><tbody><tr><td>пн, 28 сент.</td><td><span>08:50</span><span>10:25</span></td></tr></tbody></table>';
    expect(parseLessons(html, { year: 2026 })).toEqual([]);
  });

  it('returns an empty list when the schedule table is present but empty', () => {
    expect(
      parseLessons(
        '<table><tbody><tr><td>заголовок</td><td><div class="training"></div></td></tr></tbody></table>',
        { year: 2026 },
      ),
    ).toEqual([]);
  });
});
