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
): { jobs: Job[]; summary: MergeSummary } {
  const summary: MergeSummary = {
    added: 0,
    removed: 0,
    preservedEdits: 0,
    jobsCreated: 0,
    jobsDeleted: 0,
  };

  const manualJobs = existing.filter((job) => job.source !== 'timetable');
  const onceKeys = collectOncePairKeys(manualJobs);
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
        onceKeys,
        weeklyPairs,
        summary,
      ),
    );
  }

  for (const job of imported) {
    if (existingIds.has(job.id)) {
      continue;
    }

    const occurrences = occurrencesOf(job).map((occurrence) =>
      applyManualDedup(
        occurrence,
        disciplineOf(job),
        onceKeys,
        weeklyPairs,
      ),
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
  return job.origin?.discipline ?? courseName ?? '';
}

interface WeeklyPair {
  days: Weekday[];
  joinAt: string;
  discipline: string;
}

function collectOncePairKeys(jobs: Job[]): Set<string> {
  const keys = new Set<string>();
  for (const job of jobs) {
    if (job.schedule.type !== 'once') {
      continue;
    }
    keys.add(
      `${job.schedule.date}|${job.schedule.joinAt}|${disciplineOf(job)}`,
    );
  }
  return keys;
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
  onceKeys: Set<string>,
  weeklyPairs: WeeklyPair[],
): ImportedOccurrence {
  const clone = { ...occurrence };

  if (onceKeys.has(`${occurrence.date}|${occurrence.joinAt}|${discipline}`)) {
    return { ...clone, suppressed: true };
  }

  const weekday = weekdayOf(occurrence.date);
  if (weekday === undefined) {
    return clone;
  }

  for (const pair of weeklyPairs) {
    if (
      pair.joinAt === occurrence.joinAt &&
      pair.discipline === discipline &&
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
  onceKeys: Set<string>,
  weeklyPairs: WeeklyPair[],
  summary: MergeSummary,
): Job {
  const existingOccurrences = occurrencesOf(existingJob);
  const importedOccurrences = occurrencesOf(importedJob);
  const existingByDate = new Map(
    existingOccurrences.map((occurrence) => [occurrence.date, occurrence]),
  );
  const importedDates = new Set(
    importedOccurrences.map((occurrence) => occurrence.date),
  );

  for (const occurrence of importedOccurrences) {
    if (!existingByDate.has(occurrence.date)) {
      summary.added += 1;
    }
  }

  for (const occurrence of existingOccurrences) {
    if (
      !importedDates.has(occurrence.date) &&
      !occurrence.edited &&
      !occurrence.suppressed
    ) {
      summary.removed += 1;
    }
  }

  const occurrences: ImportedOccurrence[] = [];

  for (const importedOccurrence of importedOccurrences) {
    const prior = existingByDate.get(importedOccurrence.date);
    const deduped = applyManualDedup(
      importedOccurrence,
      discipline,
      onceKeys,
      weeklyPairs,
    );

    if (prior?.edited) {
      occurrences.push({ ...prior });
      summary.preservedEdits += 1;
    } else if (prior?.suppressed) {
      occurrences.push({ ...deduped, suppressed: true });
    } else {
      occurrences.push(deduped);
    }
  }

  for (const prior of existingOccurrences) {
    if (importedDates.has(prior.date)) {
      continue;
    }
    if (prior.edited) {
      occurrences.push({ ...prior });
      summary.preservedEdits += 1;
    } else if (prior.suppressed) {
      occurrences.push({ ...prior });
    }
  }

  const merged = structuredClone(existingJob);
  if (merged.schedule.type === 'imported') {
    merged.schedule.occurrences = occurrences;
  }
  return merged;
}
