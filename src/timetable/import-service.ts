import type { OnlineLectureResolver } from '../core/types.js';
import { redactSensitiveText } from '../core/redaction.js';
import type { SqliteJobRepository } from '../persistence/job-repository.js';
import type { HttpFetcher } from './http-fetcher.js';
import { mergeImportedJobs, type MergeSummary } from './import-merger.js';
import { groupOnlineDisciplines } from './online-selector.js';
import { TimetableClient } from './timetable-client.js';
import { buildImportedJobs } from './timetable-importer.js';

export const LAST_IMPORT_KEY = 'timetable.lastImportAt';

export type ImportStage =
  'group' | 'schedule' | 'courses' | 'lectures' | 'saving';

export interface TimetableImportDependencies {
  fetcher: HttpFetcher;
  resolver: OnlineLectureResolver;
  jobs: Pick<SqliteJobRepository, 'listAll' | 'replaceTimetableJobs'>;
  now(): Date;
  group?: { faculty: string; group: string };
}

export type TimetableImportResult =
  | {
      status: 'completed';
      faculty: string;
      group: string;
      lessons: number;
      complete: boolean;
      summary: MergeSummary;
      unresolved: string[];
      ambiguous: string[];
      unmapped: string[];
    }
  | { status: 'auth_required' }
  | { status: 'failed'; message: string };

export async function runTimetableImport(
  deps: TimetableImportDependencies,
  options: { onProgress?(stage: ImportStage): void } = {},
): Promise<TimetableImportResult> {
  const progress = (stage: ImportStage): void => options.onProgress?.(stage);
  try {
    const client = new TimetableClient({
      fetcher: deps.fetcher,
      year: deps.now().getFullYear(),
    });

    progress('group');
    const { faculty, group } = deps.group ?? (await client.discoverGroup());

    progress('schedule');
    const lessons = await client.fetchOnlineLessons(faculty, group);
    if (lessons.length === 0) {
      return {
        status: 'completed',
        faculty,
        group,
        lessons: 0,
        complete: true,
        summary: {
          added: 0,
          removed: 0,
          preservedEdits: 0,
          jobsCreated: 0,
          jobsDeleted: 0,
        },
        unresolved: [],
        ambiguous: [],
        unmapped: [],
      };
    }

    progress('courses');
    const { disciplines, unresolved: unmappedLessons } =
      await groupOnlineDisciplines(lessons, (lessonId) =>
        client.fetchCourseLinks(lessonId),
      );

    progress('lectures');
    const built = await buildImportedJobs({
      faculty,
      group,
      disciplines,
      resolver: deps.resolver,
    });
    if (built.authRequired) return { status: 'auth_required' };

    progress('saving');
    const complete =
      unmappedLessons.length === 0 &&
      built.unresolved.length === 0 &&
      built.ambiguous.length === 0;
    const existing = await deps.jobs.listAll();
    const { jobs, summary } = mergeImportedJobs(existing, built.jobs, {
      prune: complete,
    });
    await deps.jobs.replaceTimetableJobs(
      jobs.filter((job) => job.source === 'timetable'),
    );

    return {
      status: 'completed',
      faculty,
      group,
      lessons: lessons.length,
      complete,
      summary,
      unresolved: built.unresolved.map((item) => item.discipline),
      ambiguous: built.ambiguous.map((item) => item.discipline),
      unmapped: [...new Set(unmappedLessons.map((item) => item.discipline))],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'failed', message: redactSensitiveText(message) };
  }
}
