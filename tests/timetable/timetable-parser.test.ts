import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  discoverMyScheduleHref,
  parseFacultyAndGroup,
  parseLessons,
  parseWeekIds,
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
});
