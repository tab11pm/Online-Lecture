import { findActiveOccurrence } from './occurrence.js';
import type {
  JobRepository,
  LectureRunner,
  Run,
  RunRepository,
} from './types.js';

export class Scheduler {
  constructor(
    private readonly jobs: JobRepository,
    private readonly runs: RunRepository,
    private readonly runner: LectureRunner,
  ) {}

  async check(now: Date): Promise<Run[]> {
    const jobs = await this.jobs.listEnabled();
    const result: Run[] = [];

    for (const job of jobs) {
      const occurrence = findActiveOccurrence(job, now);
      if (occurrence === undefined) continue;

      const run = {
        jobId: occurrence.jobId,
        occurrenceId: occurrence.id,
        status: 'scheduled' as const,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      const stored = await this.runs.getOrCreate(run);
      if (stored.created) await this.runner.start(occurrence);
      result.push(stored.run);
    }

    return result;
  }
}
