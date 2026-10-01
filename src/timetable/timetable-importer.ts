import type {
  ImportedOccurrence,
  Job,
  OnlineLectureResolver,
} from '../core/types.js';
import { buildCourseUrl } from './course-mapper.js';
import type { OnlineDiscipline } from './online-selector.js';

export interface ImportedBuildResult {
  jobs: Job[];
  unresolved: OnlineDiscipline[];
  ambiguous: OnlineDiscipline[];
  authRequired: boolean;
}

export async function buildImportedJobs(input: {
  faculty: string;
  group: string;
  disciplines: OnlineDiscipline[];
  resolver: OnlineLectureResolver;
  timezone?: string;
}): Promise<ImportedBuildResult> {
  const { faculty, group, disciplines, resolver } = input;
  const timezone = input.timezone ?? 'Asia/Tomsk';

  const jobs: Job[] = [];
  const unresolved: OnlineDiscipline[] = [];
  const ambiguous: OnlineDiscipline[] = [];
  let authRequired = false;

  for (const discipline of disciplines) {
    const resolution = await resolver.resolveOnlineLecture({
      courseUrl: buildCourseUrl(discipline.sdoCourseId),
    });

    if (resolution.status === 'auth_required') {
      authRequired = true;
      continue;
    }

    if (resolution.status === 'not_found') {
      unresolved.push(discipline);
      continue;
    }

    if (resolution.status === 'ambiguous') {
      ambiguous.push(discipline);
      continue;
    }

    const occurrences: ImportedOccurrence[] = discipline.lessons.map(
      (lesson) => ({
        date: lesson.date,
        joinAt: lesson.start,
        leaveAt: lesson.end,
        ...(lesson.room ? { room: lesson.room } : {}),
      }),
    );

    jobs.push({
      id: `tt:${faculty}:${group}:${discipline.sdoCourseId}`,
      enabled: true,
      source: 'timetable',
      origin: {
        faculty,
        group,
        discipline: discipline.discipline,
        sdoCourseId: discipline.sdoCourseId,
      },
      target: { type: 'direct', activityUrl: resolution.module.activityUrl },
      schedule: { type: 'imported', timezone, occurrences },
      browser: { headless: false },
    });
  }

  return {
    jobs: mergeDuplicateJobs(jobs),
    unresolved,
    ambiguous,
    authRequired,
  };
}

function mergeDuplicateJobs(jobs: Job[]): Job[] {
  const byId = new Map<string, Job>();
  const order: string[] = [];

  for (const job of jobs) {
    const existing = byId.get(job.id);
    if (existing === undefined) {
      byId.set(job.id, job);
      order.push(job.id);
      continue;
    }

    if (
      existing.schedule.type === 'imported' &&
      job.schedule.type === 'imported'
    ) {
      const dates = new Set(
        existing.schedule.occurrences.map((occurrence) => occurrence.date),
      );
      for (const occurrence of job.schedule.occurrences) {
        if (!dates.has(occurrence.date)) {
          existing.schedule.occurrences.push(occurrence);
          dates.add(occurrence.date);
        }
      }
    }
  }

  return order.map((id) => byId.get(id)!);
}
