import { describe, expect, it, vi } from 'vitest';
import { buildImportedJobs } from '../../src/timetable/timetable-importer.js';
import type {
  OnlineLectureResolver,
  OnlineLectureResolution,
} from '../../src/core/types.js';

const discipline = {
  discipline: 'РМП2',
  sdoCourseId: '22413',
  lessons: [
    {
      lessonId: '1',
      discipline: 'РМП2',
      kind: 'Лекция',
      date: '2026-09-30',
      start: '13:15',
      end: '14:50',
      online: true,
    },
    {
      lessonId: '2',
      discipline: 'РМП2',
      kind: 'Лабораторная работа',
      date: '2026-10-07',
      start: '10:40',
      end: '12:15',
      online: true,
      room: 'ф 226',
    },
  ],
};

const resolver = (result: OnlineLectureResolution): OnlineLectureResolver => ({
  resolveOnlineLecture: vi.fn().mockResolvedValue(result),
});

describe('buildImportedJobs', () => {
  it('builds a timetable job with dated occurrences for a resolved lecture', async () => {
    const result = await buildImportedJobs({
      faculty: 'fvs',
      group: '574-1',
      disciplines: [discipline],
      resolver: resolver({
        status: 'resolved',
        course: { id: '22413', name: 'РМП2' },
        module: {
          id: 'm1',
          name: 'Онлайн-лекция',
          courseUrl: 'https://sdo.tusur.ru/course/view.php?id=22413',
          activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=1',
          type: 'lecture',
        },
      }),
    });
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      id: 'tt:fvs:574-1:22413',
      source: 'timetable',
      origin: {
        faculty: 'fvs',
        group: '574-1',
        discipline: 'РМП2',
        sdoCourseId: '22413',
      },
      target: {
        type: 'direct',
        activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=1',
      },
      schedule: {
        type: 'imported',
        occurrences: [
          { date: '2026-09-30', joinAt: '13:15', leaveAt: '14:50' },
          {
            date: '2026-10-07',
            joinAt: '10:40',
            leaveAt: '12:15',
            room: 'ф 226',
          },
        ],
      },
    });
  });

  it('merges disciplines that share an SDO course id into one job', async () => {
    const second = {
      discipline: 'РМП2 (лабораторная)',
      sdoCourseId: '22413',
      lessons: [
        {
          lessonId: '3',
          discipline: 'РМП2 (лабораторная)',
          kind: 'Лабораторная работа',
          date: '2026-10-14',
          start: '10:40',
          end: '12:15',
          online: true,
        },
      ],
    };
    const result = await buildImportedJobs({
      faculty: 'fvs',
      group: '574-1',
      disciplines: [discipline, second],
      resolver: resolver({
        status: 'resolved',
        course: { id: '22413', name: 'РМП2' },
        module: {
          id: 'm1',
          name: 'Онлайн-лекция',
          courseUrl: 'https://sdo.tusur.ru/course/view.php?id=22413',
          activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=1',
          type: 'lecture',
        },
      }),
    });
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]!.id).toBe('tt:fvs:574-1:22413');
    expect(result.jobs[0]!.schedule).toMatchObject({
      occurrences: [
        { date: '2026-09-30' },
        { date: '2026-10-07' },
        { date: '2026-10-14' },
      ],
    });
  });

  it('reports not_found and ambiguous disciplines separately', async () => {
    const notFound = await buildImportedJobs({
      faculty: 'fvs',
      group: '574-1',
      disciplines: [discipline],
      resolver: resolver({ status: 'not_found' }),
    });
    expect(notFound.jobs).toEqual([]);
    expect(notFound.unresolved).toHaveLength(1);

    const ambiguous = await buildImportedJobs({
      faculty: 'fvs',
      group: '574-1',
      disciplines: [discipline],
      resolver: resolver({ status: 'ambiguous', candidates: [] }),
    });
    expect(ambiguous.ambiguous).toHaveLength(1);
  });
});
