import { DateTime } from 'luxon';

import type { Job, Occurrence } from './types.js';

const weekdayByNumber = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
] as const;

function isoValue(value: DateTime): string {
  const iso = value.toISO();
  if (iso === null) {
    throw new Error('Unable to create an occurrence timestamp');
  }
  return iso;
}

export function findActiveOccurrence(
  job: Job,
  now: Date,
): Occurrence | undefined {
  if (!job.enabled) {
    return undefined;
  }

  const { schedule } = job;
  const localNow = DateTime.fromJSDate(now, { zone: schedule.timezone });
  const localDate = localNow.toISODate();
  if (localDate === null) {
    return undefined;
  }

  if (schedule.type === 'once' && schedule.date !== localDate) {
    return undefined;
  }

  if (schedule.type === 'weekly') {
    const weekday = weekdayByNumber[localNow.weekday - 1];
    if (weekday === undefined || !schedule.days.includes(weekday)) {
      return undefined;
    }
  }

  const joinAt = DateTime.fromISO(`${localDate}T${schedule.joinAt}`, {
    zone: schedule.timezone,
  });
  const leaveAt = DateTime.fromISO(`${localDate}T${schedule.leaveAt}`, {
    zone: schedule.timezone,
  });

  if (localNow < joinAt || localNow >= leaveAt) {
    return undefined;
  }

  const joinAtIso = isoValue(joinAt);
  return {
    id: `${job.id}:${joinAtIso}`,
    jobId: job.id,
    joinAt: joinAtIso,
    leaveAt: isoValue(leaveAt),
    timezone: schedule.timezone,
  };
}
