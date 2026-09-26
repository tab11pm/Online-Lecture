import type { Run, RunRepository } from '../core/types.js';
import { SqliteStore } from './sqlite-store.js';

export class SqliteRunRepository implements RunRepository {
  constructor(private readonly store: SqliteStore) {}

  async getOrCreate(run: Run): Promise<{ run: Run; created: boolean }> {
    const database = this.store.getDatabase();
    const result = database
      .prepare(
        'INSERT INTO runs (job_id, occurrence_id, payload, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(job_id, occurrence_id) DO NOTHING',
      )
      .run(run.jobId, run.occurrenceId, JSON.stringify(run), run.createdAt);

    if (result.changes === 1) return { run, created: true };

    const row = database
      .prepare(
        'SELECT payload FROM runs WHERE job_id = ? AND occurrence_id = ?',
      )
      .get(run.jobId, run.occurrenceId) as { payload: string };
    return { run: JSON.parse(row.payload) as Run, created: false };
  }

  async update(run: Run): Promise<void> {
    this.store
      .getDatabase()
      .prepare(
        'UPDATE runs SET payload = ? WHERE job_id = ? AND occurrence_id = ?',
      )
      .run(JSON.stringify(run), run.jobId, run.occurrenceId);
  }
}
