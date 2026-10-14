import type { Run, RunRepository } from '../core/types.js';
import { transitionRun } from '../core/lifecycle.js';
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

  async claimScheduled(
    jobId: string,
    occurrenceId: string,
    updatedAt: string,
  ): Promise<Run | undefined> {
    return this.transitionScheduled(
      jobId,
      occurrenceId,
      updatedAt,
      'resolving',
    );
  }

  async skipScheduled(
    jobId: string,
    occurrenceId: string,
    updatedAt: string,
  ): Promise<Run | undefined> {
    return this.transitionScheduled(jobId, occurrenceId, updatedAt, 'skipped');
  }

  private async transitionScheduled(
    jobId: string,
    occurrenceId: string,
    updatedAt: string,
    status: 'resolving' | 'skipped',
  ): Promise<Run | undefined> {
    const database = this.store.getDatabase();
    return database
      .transaction(() => {
        const row = database
          .prepare(
            'SELECT payload FROM runs WHERE job_id = ? AND occurrence_id = ?',
          )
          .get(jobId, occurrenceId) as { payload: string } | undefined;
        if (!row) return undefined;
        const run = JSON.parse(row.payload) as Run;
        if (run.status !== 'scheduled') return undefined;
        const claimed = transitionRun(run, status, updatedAt);
        database
          .prepare(
            'UPDATE runs SET payload = ? WHERE job_id = ? AND occurrence_id = ?',
          )
          .run(JSON.stringify(claimed), jobId, occurrenceId);
        return claimed;
      })
      .immediate();
  }
}
