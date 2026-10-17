import { DateTime } from 'luxon';
import type { Job, Weekday } from './types.js';

export interface EditImportedTimeInput {
  jobId: string;
  date: string;
  joinAt: string;
  leaveAt: string;
}

export interface RescheduleInput {
  jobId: string;
  date: string;
  newDate: string;
  newJoinAt: string;
  newLeaveAt: string;
}

export type ManualScheduleInput =
  | { type: 'once'; date: string; joinAt: string; leaveAt: string }
  | { type: 'weekly'; days: Weekday[]; joinAt: string; leaveAt: string };

export const SCHEDULE_TIMEZONE = 'Asia/Krasnoyarsk';

const weekdays: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function dateTime(date: string, time: string, zone: string): DateTime {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new Error('Invalid lecture date or time');
  }
  const value = DateTime.fromISO(`${date}T${time}`, { zone });
  if (
    !value.isValid ||
    value.toISODate() !== date ||
    value.toFormat('HH:mm') !== time
  ) {
    throw new Error('Invalid lecture date or time');
  }
  return value;
}

function interval(
  date: string,
  joinAt: string,
  leaveAt: string,
  zone: string,
): DateTime {
  const start = dateTime(date, joinAt, zone);
  const end = dateTime(date, leaveAt, zone);
  if (end <= start) throw new Error('Lecture exit must be after entry');
  return start;
}

export function validateManualSchedule(
  input: ManualScheduleInput,
  now: Date,
): void {
  if (input.type === 'once') {
    const start = interval(
      input.date,
      input.joinAt,
      input.leaveAt,
      SCHEDULE_TIMEZONE,
    );
    if (start.toMillis() <= now.getTime())
      throw new Error('Lecture entry must be in the future');
    return;
  }
  if (!input.days.length || input.days.some((day) => !weekdays.includes(day))) {
    throw new Error('Select at least one weekday');
  }
  const today = DateTime.fromJSDate(now, { zone: SCHEDULE_TIMEZONE });
  const date = today.toISODate();
  if (!date) throw new Error('Invalid lecture date');
  interval(date, input.joinAt, input.leaveAt, SCHEDULE_TIMEZONE);
}

function importedEntry(
  job: Job,
  date: string,
): { index: number; schedule: Extract<Job['schedule'], { type: 'imported' }> } {
  if (job.source !== 'timetable' || job.schedule.type !== 'imported') {
    throw new Error('Imported lecture not found');
  }
  const index = job.schedule.occurrences.findIndex(
    (entry) => entry.date === date,
  );
  if (
    index < 0 ||
    job.schedule.occurrences.some(
      (entry, i) => i !== index && entry.date === date,
    )
  ) {
    throw new Error('Imported occurrence not found');
  }
  return { index, schedule: job.schedule };
}

export function editImportedTime(job: Job, input: EditImportedTimeInput): Job {
  if (job.id !== input.jobId) throw new Error('Imported lecture not found');
  const { index, schedule } = importedEntry(job, input.date);
  interval(input.date, input.joinAt, input.leaveAt, schedule.timezone);
  return {
    ...job,
    schedule: {
      ...schedule,
      occurrences: schedule.occurrences.map((entry, i) =>
        i === index
          ? {
              ...entry,
              joinAt: input.joinAt,
              leaveAt: input.leaveAt,
              edited: true,
            }
          : { ...entry },
      ),
    },
  };
}

export function makeRescheduledJob(
  job: Job,
  input: RescheduleInput,
  id: string,
): { source: Job; replacement: Job } {
  if (job.id !== input.jobId) throw new Error('Imported lecture not found');
  const { index, schedule } = importedEntry(job, input.date);
  if (schedule.occurrences[index]?.suppressed)
    throw new Error('Imported occurrence is already hidden');
  interval(input.newDate, input.newJoinAt, input.newLeaveAt, schedule.timezone);
  const source: Job = {
    ...job,
    schedule: {
      ...schedule,
      occurrences: schedule.occurrences.map((entry, i) =>
        i === index ? { ...entry, suppressed: true } : { ...entry },
      ),
    },
  };
  const replacement: Job = {
    id,
    enabled: true,
    source: 'manual',
    title:
      job.origin?.discipline ??
      (job.target.type === 'search' ? job.target.courseName : undefined) ??
      job.id,
    rescheduledFrom: { jobId: job.id, date: input.date },
    schedule: {
      type: 'once',
      date: input.newDate,
      joinAt: input.newJoinAt,
      leaveAt: input.newLeaveAt,
      timezone: schedule.timezone,
    },
    target: structuredClone(job.target),
    browser: { ...job.browser },
  };
  return { source, replacement };
}
