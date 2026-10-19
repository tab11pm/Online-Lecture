import { DateTime } from 'luxon';

import type { ImportedOccurrence, Job, Weekday } from '../core/types.js';

export interface MergeSummary {
  added: number;
  removed: number;
  preservedEdits: number;
  jobsCreated: number;
  jobsDeleted: number;
}

export function mergeImportedJobs(
  existing: Job[],
  imported: Job[],
  options: { prune?: boolean } = {},
): { jobs: Job[]; summary: MergeSummary } {
  const prune = options.prune ?? true;
  const summary: MergeSummary = {
    added: 0,
    removed: 0,
    preservedEdits: 0,
    jobsCreated: 0,
    jobsDeleted: 0,
  };

  const manualJobs = existing.filter((job) => job.source !== 'timetable');
  const oncePairs = collectOncePairs(manualJobs);
  const weeklyPairs = collectWeeklyPairs(manualJobs);

  const importedById = new Map(imported.map((job) => [job.id, job]));
  const existingIds = new Set(existing.map((job) => job.id));

  const jobs: Job[] = [];

  for (const job of existing) {
    if (job.source !== 'timetable') {
      jobs.push(structuredClone(job));
      continue;
    }

    const importedJob = importedById.get(job.id);
    if (importedJob === undefined) {
      if (!prune) {
        jobs.push(structuredClone(job));
        continue;
      }
      const occurrences = occurrencesOf(job);
      const preserved = occurrences.filter(
        (occurrence) => occurrence.edited || occurrence.suppressed,
      );
      if (preserved.length === 0) {
        summary.jobsDeleted += 1;
        continue;
      }
      summary.preservedEdits += preserved.filter(
        (occurrence) => occurrence.edited,
      ).length;
      jobs.push(structuredClone(job));
      continue;
    }

    jobs.push(
      mergeMatchedJob(
        job,
        importedJob,
        disciplineOf(importedJob),
        oncePairs,
        weeklyPairs,
        prune,
        summary,
      ),
    );
  }

  for (const job of imported) {
    if (existingIds.has(job.id)) {
      continue;
    }

    const occurrences = occurrencesOf(job).map((occurrence) =>
      applyManualDedup(occurrence, disciplineOf(job), oncePairs, weeklyPairs),
    );

    const merged = structuredClone(job);
    if (merged.schedule.type === 'imported') {
      merged.schedule.occurrences = occurrences;
    }
    summary.jobsCreated += 1;
    summary.added += occurrences.length;
    jobs.push(merged);
  }

  return { jobs, summary };
}

function occurrencesOf(job: Job): ImportedOccurrence[] {
  return job.schedule.type === 'imported' ? job.schedule.occurrences : [];
}

function disciplineOf(job: Job): string {
  const courseName =
    job.target.type === 'search' ? job.target.courseName : undefined;
  return job.title?.trim() || job.origin?.discipline || courseName || '';
}

interface OncePair {
  date: string;
  joinAt: string;
  discipline: string;
}

interface WeeklyPair {
  days: Weekday[];
  joinAt: string;
  discipline: string;
}

function disciplineMatches(
  pairDiscipline: string,
  discipline: string,
): boolean {
  const normalizedPair = pairDiscipline.trim().toLocaleLowerCase('ru');
  const normalizedDiscipline = discipline.trim().toLocaleLowerCase('ru');
  return normalizedPair === '' || normalizedPair === normalizedDiscipline;
}

function collectOncePairs(jobs: Job[]): OncePair[] {
  const pairs: OncePair[] = [];
  for (const job of jobs) {
    if (job.schedule.type !== 'once') {
      continue;
    }
    pairs.push({
      date: job.schedule.date,
      joinAt: job.schedule.joinAt,
      discipline: disciplineOf(job),
    });
  }
  return pairs;
}

function collectWeeklyPairs(jobs: Job[]): WeeklyPair[] {
  const pairs: WeeklyPair[] = [];
  for (const job of jobs) {
    if (job.schedule.type !== 'weekly') {
      continue;
    }
    pairs.push({
      days: job.schedule.days,
      joinAt: job.schedule.joinAt,
      discipline: disciplineOf(job),
    });
  }
  return pairs;
}

const weekdayByNumber: Weekday[] = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
];

function weekdayOf(date: string): Weekday | undefined {
  const parsed = DateTime.fromISO(date, { zone: 'utc' });
  if (!parsed.isValid) {
    return undefined;
  }
  return weekdayByNumber[parsed.weekday - 1];
}

function applyManualDedup(
  occurrence: ImportedOccurrence,
  discipline: string,
  oncePairs: OncePair[],
  weeklyPairs: WeeklyPair[],
): ImportedOccurrence {
  const clone = { ...occurrence };

  const onceMatch = oncePairs.some(
    (pair) =>
      pair.date === occurrence.date &&
      pair.joinAt === occurrence.joinAt &&
      disciplineMatches(pair.discipline, discipline),
  );
  if (onceMatch) {
    return { ...clone, suppressed: true };
  }

  const weekday = weekdayOf(occurrence.date);
  if (weekday === undefined) {
    return clone;
  }

  for (const pair of weeklyPairs) {
    if (
      pair.joinAt === occurrence.joinAt &&
      disciplineMatches(pair.discipline, discipline) &&
      pair.days.includes(weekday)
    ) {
      return { ...clone, suppressed: true };
    }
  }

  return clone;
}

function mergeMatchedJob(
  existingJob: Job,
  importedJob: Job,
  discipline: string,
  oncePairs: OncePair[],
  weeklyPairs: WeeklyPair[],
  prune: boolean,
  summary: MergeSummary,
): Job {
  const existingOccurrences = occurrencesOf(existingJob);
  const importedOccurrences = occurrencesOf(importedJob);
  const key = (occurrence: ImportedOccurrence) =>
    `${occurrence.date}\u0000${occurrence.originalJoinAt ?? occurrence.joinAt}`;
  const matched = new Set<number>();
  const occurrences: ImportedOccurrence[] = [];

  for (const importedOccurrence of importedOccurrences) {
    let priorIndex = existingOccurrences.findIndex(
      (entry, index) =>
        !matched.has(index) && key(entry) === key(importedOccurrence),
    );
    if (priorIndex < 0) {
      const oldEntries = existingOccurrences
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry.date === importedOccurrence.date);
      const newEntries = importedOccurrences.filter(
        (entry) => entry.date === importedOccurrence.date,
      );
      if (
        oldEntries.length === 1 &&
        newEntries.length === 1 &&
        oldEntries[0]!.entry.edited &&
        !oldEntries[0]!.entry.originalJoinAt
      ) {
        priorIndex = oldEntries[0]!.index;
      }
    }
    if (priorIndex >= 0) matched.add(priorIndex);
    else summary.added += 1;
    const prior = existingOccurrences[priorIndex];
    const deduped = applyManualDedup(
      importedOccurrence,
      discipline,
      oncePairs,
      weeklyPairs,
    );

    if (prior?.edited) {
      const editedDeduped = applyManualDedup(
        prior,
        discipline,
        oncePairs,
        weeklyPairs,
      );
      occurrences.push({
        ...prior,
        ...(editedDeduped.suppressed ? { suppressed: true } : {}),
      });
      summary.preservedEdits += 1;
    } else if (prior?.suppressed) {
      occurrences.push({ ...deduped, suppressed: true });
    } else {
      occurrences.push(deduped);
    }
  }

  for (const [index, prior] of existingOccurrences.entries()) {
    if (matched.has(index)) continue;
    if (prior.edited) {
      const deduped = applyManualDedup(
        prior,
        discipline,
        oncePairs,
        weeklyPairs,
      );
      occurrences.push({
        ...prior,
        ...(deduped.suppressed ? { suppressed: true } : {}),
      });
      summary.preservedEdits += 1;
    } else if (prior.suppressed) {
      occurrences.push({ ...prior });
    } else if (!prune) {
      occurrences.push({ ...prior });
    } else {
      summary.removed += 1;
    }
  }

  const merged = structuredClone(importedJob);
  merged.enabled = existingJob.enabled;
  if (merged.schedule.type === 'imported') {
    merged.schedule.occurrences = occurrences;
  }
  return merged;
}
