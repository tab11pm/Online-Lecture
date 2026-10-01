import { describe, expect, it, vi } from 'vitest';
import { groupOnlineDisciplines } from '../../src/timetable/online-selector.js';
import type { ParsedLesson } from '../../src/timetable/types.js';

const lesson = (over: Partial<ParsedLesson>): ParsedLesson => ({
  lessonId: '1',
  discipline: 'РМП2',
  kind: 'Лекция',
  date: '2026-09-30',
  start: '13:15',
  end: '14:50',
  online: true,
  ...over,
});

describe('groupOnlineDisciplines', () => {
  it('groups lessons of one discipline under its SDO course id', async () => {
    const fetchLinks = vi.fn().mockResolvedValue([
      {
        url: 'https://sdo.tusur.ru/auth/edu?id=22413',
        anchor: 'a',
        group: '574-1',
      },
    ]);
    const result = await groupOnlineDisciplines(
      [lesson({}), lesson({ lessonId: '2', date: '2026-10-07' })],
      fetchLinks,
    );
    expect(result.disciplines).toHaveLength(1);
    expect(result.disciplines[0]).toMatchObject({
      discipline: 'РМП2',
      sdoCourseId: '22413',
    });
    expect(result.disciplines[0]!.lessons).toHaveLength(2);
    expect(fetchLinks).toHaveBeenCalledTimes(1); // кэш по дисциплине
  });

  it('reports lessons whose course link cannot be resolved', async () => {
    const result = await groupOnlineDisciplines(
      [lesson({ lessonId: '7' })],
      async () => [],
    );
    expect(result.disciplines).toEqual([]);
    expect(result.unresolved.map((l) => l.lessonId)).toEqual(['7']);
  });
});
