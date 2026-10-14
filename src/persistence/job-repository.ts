import type { Job, JobRepository } from '../core/types.js';
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
}
