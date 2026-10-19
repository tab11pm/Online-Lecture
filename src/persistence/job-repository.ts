import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import {
  editImportedTime as editImportedJob,
  importedEntry as selectImportedEntry,
  makeRescheduledJob,
  validateManualSchedule,
  SCHEDULE_TIMEZONE,
  type EditImportedTimeInput,
  type RescheduleInput,
  type ManualScheduleInput,
} from '../core/schedule-editing.js';
import type { Job, JobRepository, Run } from '../core/types.js';
import {
  mergeImportedJobs,
  type MergeSummary,
} from '../timetable/import-merger.js';
import { SqliteStore } from './sqlite-store.js';

export class SqliteJobRepository implements JobRepository {
  constructor(private readonly store: SqliteStore) {}

  async listEnabled(): Promise<Job[]> {
    const rows = this.store
      .getDatabase()
      .prepare(
        "SELECT payload FROM jobs WHERE json_extract(payload, '$.enabled') = 1 ORDER BY id",
      )
      .all() as Array<{ payload: string }>;
    return rows.map((row) => JSON.parse(row.payload) as Job);
  }

  async getById(id: string): Promise<Job | undefined> {
    const row = this.store
      .getDatabase()
      .prepare('SELECT payload FROM jobs WHERE id = ?')
      .get(id) as { payload: string } | undefined;
    return row === undefined ? undefined : (JSON.parse(row.payload) as Job);
  }

  async listAll(): Promise<Job[]> {
    const rows = this.store
      .getDatabase()
      .prepare('SELECT payload FROM jobs ORDER BY id')
      .all() as Array<{ payload: string }>;
    return rows.map((row) => JSON.parse(row.payload) as Job);
  }

  async delete(id: string): Promise<void> {
    await this.store.createBackup();
    this.store.getDatabase().prepare('DELETE FROM jobs WHERE id = ?').run(id);
  }

  async save(job: Job): Promise<void> {
    await this.store.createBackup();
    this.store
      .getDatabase()
      .prepare(
        `INSERT INTO jobs (id, payload, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
      )
      .run(job.id, JSON.stringify(job), new Date().toISOString());
  }

  async replaceTimetableJobs(jobs: Job[]): Promise<void> {
    await this.store.createBackup();
    const database = this.store.getDatabase();
    const keep = new Set(jobs.map((job) => job.id));
    const existing = database
      .prepare(
        "SELECT id FROM jobs WHERE json_extract(payload, '$.source') = 'timetable'",
      )
      .all() as Array<{ id: string }>;
    const remove = database.prepare('DELETE FROM jobs WHERE id = ?');
    const upsert = database.prepare(
      `INSERT INTO jobs (id, payload, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
    );
    const updatedAt = new Date().toISOString();
    database.transaction(() => {
      for (const { id } of existing) {
        if (!keep.has(id)) remove.run(id);
      }
      for (const job of jobs) {
        upsert.run(job.id, JSON.stringify(job), updatedAt);
      }
    })();
  }

  async editImportedTime(
    input: EditImportedTimeInput,
    now: Date,
  ): Promise<void> {
    await this.store.createBackup();
    const database = this.store.getDatabase();
    database
      .transaction(() => {
        const job = this.readJob(input.jobId);
        if (!job) throw new Error('Lecture not found');
        const entry = this.importedEntry(job, input.date, input.occurrenceId);
        this.assertPending(job, input.date, entry.joinAt, now);
        const edited = editImportedJob(job, input);
        const schedule = edited.schedule;
        if (schedule.type !== 'imported')
          throw new Error('Imported lecture not found');
        this.assertFuture(schedule.timezone, input.date, input.joinAt, now);
        this.writeJob(edited);
      })
      .immediate();
  }

  async reschedule(input: RescheduleInput, now: Date): Promise<string> {
    await this.store.createBackup();
    const database = this.store.getDatabase();
    return database
      .transaction(() => {
        const job = this.readJob(input.jobId);
        if (!job) throw new Error('Lecture not found');
        const entry = this.importedEntry(job, input.date, input.occurrenceId);
        this.assertPending(job, input.date, entry.joinAt, now);
        this.assertFuture(
          job.schedule.timezone,
          input.newDate,
          input.newJoinAt,
          now,
        );
        const duplicate = this.readAll().some(
          (item) =>
            item.rescheduledFrom?.jobId === job.id &&
            (input.occurrenceId
              ? item.rescheduledFrom.occurrenceId === input.occurrenceId
              : item.rescheduledFrom.date === input.date),
        );
        if (duplicate) throw new Error('Occurrence already rescheduled');
        const id = `manual:${randomUUID()}`;
        const result = makeRescheduledJob(job, input, id);
        if (
          this.readAll().some(
            (item) =>
              item.id !== job.id &&
              this.collidesAt(
                item,
                input.newDate,
                input.newJoinAt,
                result.replacement.title ?? '',
              ),
          )
        )
          throw new Error('Lecture slot is already occupied');
        this.writeJob(result.source);
        this.writeJob(result.replacement);
        return id;
      })
      .immediate();
  }

  async cancelReschedule(replacementJobId: string, now: Date): Promise<void> {
    await this.store.createBackup();
    const database = this.store.getDatabase();
    database
      .transaction(() => {
        const replacement = this.readJob(replacementJobId);
        if (
          !replacement?.rescheduledFrom ||
          replacement.schedule.type !== 'once'
        ) {
          throw new Error('Rescheduled lecture not found');
        }
        const source = this.readJob(replacement.rescheduledFrom.jobId);
        if (!source) throw new Error('Source lecture not found');
        const entry = this.importedEntry(
          source,
          replacement.rescheduledFrom.date,
          replacement.rescheduledFrom.occurrenceId,
        );
        if (source.schedule.type !== 'imported')
          throw new Error('Source lecture not found');
        if (!entry.suppressed) throw new Error('Source lecture is not hidden');
        this.assertPending(source, entry.date, entry.joinAt, now);
        this.assertPending(
          replacement,
          replacement.schedule.date,
          replacement.schedule.joinAt,
          now,
        );
        const title = source.title ?? source.origin?.discipline ?? '';
        if (
          this.readAll().some(
            (item) =>
              item.id !== source.id &&
              item.id !== replacementJobId &&
              this.collidesAt(item, entry.date, entry.joinAt, title),
          )
        )
          throw new Error('Lecture slot is already occupied');
        const edited: Job = {
          ...source,
          schedule: {
            ...source.schedule,
            occurrences: source.schedule.occurrences.map((item) =>
              item === entry ? { ...item, suppressed: false } : item,
            ),
          },
        };
        this.writeJob(edited);
        database.prepare('DELETE FROM jobs WHERE id = ?').run(replacementJobId);
      })
      .immediate();
  }

  async saveManual(job: Job, now: Date): Promise<void> {
    if (
      job.source !== 'manual' ||
      !job.title?.trim() ||
      job.schedule.type === 'imported'
    ) {
      throw new Error('Invalid manual lecture');
    }
    const input: ManualScheduleInput =
      job.schedule.type === 'once'
        ? {
            type: 'once',
            date: job.schedule.date,
            joinAt: job.schedule.joinAt,
            leaveAt: job.schedule.leaveAt,
          }
        : {
            type: 'weekly',
            days: job.schedule.days,
            joinAt: job.schedule.joinAt,
            leaveAt: job.schedule.leaveAt,
          };
    if (job.schedule.timezone !== SCHEDULE_TIMEZONE)
      throw new Error('Invalid lecture timezone');
    validateManualSchedule(input, now);
    await this.store.createBackup();
    const database = this.store.getDatabase();
    database
      .transaction(() => {
        const existing = this.readAll();
        if (existing.some((item) => item.id === job.id))
          throw new Error('Manual lecture already exists');
        if (existing.some((item) => this.sameManualSlot(item, job)))
          throw new Error('Manual lecture already exists');
        const imported = existing.filter((item) => item.source === 'timetable');
        const merged = mergeImportedJobs([...existing, job], imported, {
          prune: false,
        });
        this.writeJob(job);
        for (const item of merged.jobs) {
          if (item.source === 'timetable') this.writeJob(item);
        }
      })
      .immediate();
  }

  async deleteManual(jobId: string): Promise<void> {
    await this.store.createBackup();
    const database = this.store.getDatabase();
    database
      .transaction(() => {
        const job = this.readJob(jobId);
        if (!job || job.source === 'timetable' || job.rescheduledFrom)
          throw new Error('Manual lecture not found');
        database.prepare('DELETE FROM jobs WHERE id = ?').run(jobId);
      })
      .immediate();
  }

  async mergeTimetableJobs(
    importedJobs: Job[],
    prune: boolean,
  ): Promise<MergeSummary> {
    await this.store.createBackup();
    const database = this.store.getDatabase();
    return database
      .transaction(() => {
        const existing = this.readAll();
        const { jobs, summary } = mergeImportedJobs(existing, importedJobs, {
          prune,
        });
        const keep = new Set(
          jobs.filter((job) => job.source === 'timetable').map((job) => job.id),
        );
        for (const job of existing) {
          if (job.source === 'timetable' && !keep.has(job.id)) {
            database.prepare('DELETE FROM jobs WHERE id = ?').run(job.id);
          }
        }
        for (const job of jobs) {
          if (job.source === 'timetable') this.writeJob(job);
        }
        return summary;
      })
      .immediate();
  }

  private readJob(id: string): Job | undefined {
    const row = this.store
      .getDatabase()
      .prepare('SELECT payload FROM jobs WHERE id = ?')
      .get(id) as { payload: string } | undefined;
    return row ? (JSON.parse(row.payload) as Job) : undefined;
  }

  private readAll(): Job[] {
    const rows = this.store
      .getDatabase()
      .prepare('SELECT payload FROM jobs ORDER BY id')
      .all() as { payload: string }[];
    return rows.map((row) => JSON.parse(row.payload) as Job);
  }

  private writeJob(job: Job): void {
    this.store
      .getDatabase()
      .prepare(
        `INSERT INTO jobs (id, payload, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
      )
      .run(job.id, JSON.stringify(job), new Date().toISOString());
  }

  private importedEntry(job: Job, date: string, occurrenceId?: string) {
    const { index, schedule } = selectImportedEntry(job, date, occurrenceId);
    return schedule.occurrences[index]!;
  }

  private assertFuture(
    zone: string,
    date: string,
    time: string,
    now: Date,
  ): void {
    const start = DateTime.fromISO(`${date}T${time}`, { zone });
    if (!start.isValid || start.toMillis() <= now.getTime())
      throw new Error('Lecture entry has already started');
  }

  private assertPending(job: Job, date: string, time: string, now: Date): void {
    this.assertFuture(job.schedule.timezone, date, time, now);
    const iso = DateTime.fromISO(`${date}T${time}`, {
      zone: job.schedule.timezone,
    }).toISO();
    const occurrenceId = `${job.id}:${iso}`;
    const row = this.store
      .getDatabase()
      .prepare(
        'SELECT payload FROM runs WHERE job_id = ? AND occurrence_id = ?',
      )
      .get(job.id, occurrenceId) as { payload: string } | undefined;
    if (row && (JSON.parse(row.payload) as Run).status !== 'scheduled') {
      throw new Error('Lecture run has already started');
    }
  }

  private sameManualSlot(a: Job, b: Job): boolean {
    if (
      a.source === 'timetable' ||
      a.schedule.type === 'imported' ||
      b.schedule.type === 'imported'
    )
      return false;
    if (
      a.title?.trim().toLocaleLowerCase('ru') !==
      b.title?.trim().toLocaleLowerCase('ru')
    )
      return false;
    if (a.schedule.joinAt !== b.schedule.joinAt) return false;
    if (a.schedule.type === 'once' && b.schedule.type === 'once')
      return a.schedule.date === b.schedule.date;
    if (a.schedule.type === 'weekly' && b.schedule.type === 'weekly')
      return a.schedule.days.some(
        (day) => b.schedule.type === 'weekly' && b.schedule.days.includes(day),
      );
    const once = a.schedule.type === 'once' ? a.schedule : b.schedule;
    const weekly = a.schedule.type === 'weekly' ? a.schedule : b.schedule;
    if (once.type !== 'once' || weekly.type !== 'weekly') return false;
    const weekday = DateTime.fromISO(once.date, {
      zone: once.timezone,
    }).weekday;
    const names = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    return weekly.days.includes(
      names[weekday - 1] as (typeof weekly.days)[number],
    );
  }

  private collidesAt(
    job: Job,
    date: string,
    joinAt: string,
    title: string,
  ): boolean {
    if (!job.enabled) return false;
    const jobTitle =
      job.title ??
      job.origin?.discipline ??
      (job.target.type === 'search' ? job.target.courseName : undefined) ??
      '';
    if (
      jobTitle.trim().toLocaleLowerCase('ru') !==
      title.trim().toLocaleLowerCase('ru')
    )
      return false;
    if (job.schedule.type === 'imported')
      return job.schedule.occurrences.some(
        (entry) =>
          entry.date === date && entry.joinAt === joinAt && !entry.suppressed,
      );
    if (job.schedule.joinAt !== joinAt) return false;
    if (job.schedule.type === 'once') return job.schedule.date === date;
    const weekday = DateTime.fromISO(date, {
      zone: job.schedule.timezone,
    }).weekday;
    return job.schedule.days.includes(
      (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const)[
        weekday - 1
      ]!,
    );
  }
}
