import { DateTime } from 'luxon';

import type { Job, Run, RunStatus } from './types.js';

export interface AgendaEntry {
  jobId: string;
  occurrenceId: string;
  title: string;
  date: string; // YYYY-MM-DD in the job timezone
  joinAt: string; // HH:MM
  leaveAt: string; // HH:MM
  joinAtIso: string;
  leaveAtIso: string;
  skipped: boolean;
  run?: Run;
}

export interface Agenda {
  entries: AgendaEntry[];
  current?: AgendaEntry;
  next?: AgendaEntry;
  lastRun?: AgendaEntry;
}

const weekdayByNumber = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
] as const;

const terminalStatuses: ReadonlySet<RunStatus> = new Set([
  'completed',
  'skipped',
  'blocked',
  'failed',
]);

interface Slot {
  date: string;
  joinAt: string;
  leaveAt: string;
  skipped: boolean;
}

function iso(value: DateTime): string {
  const result = value.toISO();
  if (result === null) {
    throw new Error('Unable to create an agenda timestamp');
  }
  return result;
}

function slotsFor(job: Job, start: DateTime, end: DateTime): Slot[] {
  const { schedule } = job;
  const inRange = (date: string): boolean => {
    const day = DateTime.fromISO(date, { zone: schedule.timezone });
    return day.isValid && day >= start && day < end;
  };

  if (schedule.type === 'imported') {
    return schedule.occurrences
      .filter((entry) => inRange(entry.date))
      .map((entry) => ({
        date: entry.date,
        joinAt: entry.joinAt,
        leaveAt: entry.leaveAt,
        skipped: entry.suppressed === true,
      }));
  }

  if (schedule.type === 'once') {
    return inRange(schedule.date)
      ? [
          {
            date: schedule.date,
            joinAt: schedule.joinAt,
            leaveAt: schedule.leaveAt,
            skipped: false,
          },
        ]
      : [];
  }

  const slots: Slot[] = [];
  for (let day = start; day < end; day = day.plus({ days: 1 }).startOf('day')) {
    const weekday = weekdayByNumber[day.weekday - 1];
    const date = day.toISODate();
    if (
      weekday !== undefined &&
      date !== null &&
      schedule.days.includes(weekday)
    ) {
      slots.push({
        date,
        joinAt: schedule.joinAt,
        leaveAt: schedule.leaveAt,
        skipped: false,
      });
    }
  }
  return slots;
}

export function buildAgenda(
  jobs: Job[],
  runs: Run[],
  now: Date,
  days: number,
): Agenda {
  const runByKey = new Map<string, Run>();
  for (const run of runs) {
    runByKey.set(`${run.jobId}\u0000${run.occurrenceId}`, run);
  }

  const entries: AgendaEntry[] = [];
  for (const job of jobs) {
    if (job.schedule.type === 'weekly' && !job.enabled) continue;
    const zone = job.schedule.timezone;
    const start = DateTime.fromJSDate(now, { zone }).startOf('day');
    const end = start.plus({ days });
    for (const slot of slotsFor(job, start, end)) {
      const join = DateTime.fromISO(`${slot.date}T${slot.joinAt}`, { zone });
      const leave = DateTime.fromISO(`${slot.date}T${slot.leaveAt}`, { zone });
      if (!join.isValid || !leave.isValid) continue;
      const joinAtIso = iso(join);
      const occurrenceId = `${job.id}:${joinAtIso}`;
      const run = runByKey.get(`${job.id}\u0000${occurrenceId}`);
      entries.push({
        jobId: job.id,
        occurrenceId,
        title:
          job.title ??
          job.origin?.discipline ??
          (job.source !== 'timetable' && job.target.type === 'search'
            ? job.target.courseName
            : undefined) ??
          job.id,
        date: slot.date,
        joinAt: slot.joinAt,
        leaveAt: slot.leaveAt,
        joinAtIso,
        leaveAtIso: iso(leave),
        skipped: slot.skipped,
        ...(run === undefined ? {} : { run }),
      });
    }
  }

  entries.sort((a, b) => {
    const delta =
      DateTime.fromISO(a.joinAtIso).toMillis() -
      DateTime.fromISO(b.joinAtIso).toMillis();
    return delta !== 0 ? delta : a.jobId.localeCompare(b.jobId);
  });

  const nowMs = now.getTime();
  const agenda: Agenda = { entries };
  for (const entry of entries) {
    const joinMs = DateTime.fromISO(entry.joinAtIso).toMillis();
    const leaveMs = DateTime.fromISO(entry.leaveAtIso).toMillis();
    if (
      agenda.current === undefined &&
      entry.run !== undefined &&
      !terminalStatuses.has(entry.run.status) &&
      joinMs <= nowMs &&
      nowMs < leaveMs
    ) {
      agenda.current = entry;
    }
    if (agenda.next === undefined && !entry.skipped && joinMs > nowMs) {
      agenda.next = entry;
    }
    if (
      entry.run !== undefined &&
      terminalStatuses.has(entry.run.status) &&
      (agenda.lastRun?.run === undefined ||
        entry.run.updatedAt > agenda.lastRun.run.updatedAt)
    ) {
      agenda.lastRun = entry;
    }
  }
  return agenda;
}
