import { DateTime } from 'luxon';

import type { Job } from './types.js';

export function setOccurrenceSuppressed(
  job: Job,
  occurrenceId: string,
  suppressed: boolean,
): Job {
  const { schedule } = job;
  const prefix = `${job.id}:`;
  if (schedule.type !== 'imported' || !occurrenceId.startsWith(prefix)) {
    throw new Error('Occurrence not found');
  }

  // Job ids contain ':', so strip the known prefix instead of splitting.
  const joinAt = DateTime.fromISO(occurrenceId.slice(prefix.length), {
    setZone: false,
    zone: schedule.timezone,
  });
  const date = joinAt.toISODate();
  const time = joinAt.toFormat('HH:mm');
  if (!joinAt.isValid || date === null) {
    throw new Error('Occurrence not found');
  }

  const index = schedule.occurrences.findIndex(
    (entry) => entry.date === date && entry.joinAt === time,
  );
  if (index === -1) {
    throw new Error('Occurrence not found');
  }

  return {
    ...job,
    schedule: {
      ...schedule,
      occurrences: schedule.occurrences.map((entry, position) =>
        position === index ? { ...entry, suppressed } : entry,
      ),
    },
  };
}
