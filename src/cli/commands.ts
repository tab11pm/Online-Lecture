import { readFile } from 'node:fs/promises';

import { parseJobConfig } from '../config/job-config.js';
import { findActiveOccurrence } from '../core/occurrence.js';
import { Scheduler } from '../core/scheduler.js';
import type { LectureRunner } from '../core/types.js';
import { SqliteJobRepository } from '../persistence/job-repository.js';
import { SqliteRunRepository } from '../persistence/run-repository.js';
import { SqliteStore } from '../persistence/sqlite-store.js';

export interface CliResult {
  exitCode: number;
  output: string;
}

export async function executeCli(argumentsList: string[]): Promise<CliResult> {
  if (argumentsList[0] === 'auth' && argumentsList[1] === 'check') {
    return { exitCode: 2, output: 'SDO MCP adapter is not configured\n' };
  }

  if (argumentsList[0] === 'config' && argumentsList[1] === 'validate') {
    const configPath = optionValue(argumentsList, '--config');
    if (configPath === undefined) {
      return { exitCode: 1, output: 'Missing required --config <yaml>\n' };
    }
    try {
      const job = parseJobConfig(await readFile(configPath, 'utf8'));
      return { exitCode: 0, output: `Configuration is valid: ${job.id}\n` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { exitCode: 1, output: `Configuration is invalid: ${message}\n` };
    }
  }

  if (argumentsList[0] === 'jobs' && argumentsList[1] === 'list') {
    const databasePath = optionValue(argumentsList, '--db');
    if (databasePath === undefined) {
      return { exitCode: 1, output: 'Missing required --db <sqlite>\n' };
    }
    const store = new SqliteStore(databasePath);
    await store.open();
    const jobs = await new SqliteJobRepository(store).listEnabled();
    store.close();
    return {
      exitCode: 0,
      output: jobs
        .map((job) => `${job.id}\tenabled\t${job.schedule.type}\n`)
        .join(''),
    };
  }

  if (argumentsList[0] === 'run') {
    const configPath = optionValue(argumentsList, '--config');
    const databasePath = optionValue(argumentsList, '--db');
    if (configPath === undefined || databasePath === undefined) {
      return {
        exitCode: 1,
        output: 'run requires --config <yaml> and --db <sqlite>\n',
      };
    }
    try {
      const job = parseJobConfig(await readFile(configPath, 'utf8'));
      const store = new SqliteStore(databasePath);
      await store.open();
      const jobs = new SqliteJobRepository(store);
      await jobs.save(job);
      const runs = await new Scheduler(
        jobs,
        new SqliteRunRepository(store),
        noOpRunner,
      ).check(nowFrom(argumentsList));
      store.close();
      return {
        exitCode: 0,
        output: runs.map((run) => `${run.jobId}\t${run.status}\n`).join(''),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { exitCode: 1, output: `Run failed: ${message}\n` };
    }
  }

  if (argumentsList[0] === 'run-once') {
    const jobId = argumentsList[1];
    const databasePath = optionValue(argumentsList, '--db');
    if (jobId === undefined || databasePath === undefined) {
      return {
        exitCode: 1,
        output: 'run-once requires <job-id> and --db <sqlite>\n',
      };
    }
    const store = new SqliteStore(databasePath);
    await store.open();
    const jobs = new SqliteJobRepository(store);
    const job = await jobs.getById(jobId);
    if (job === undefined) {
      store.close();
      return { exitCode: 1, output: `Job not found: ${jobId}\n` };
    }
    const occurrence = findActiveOccurrence(job, nowFrom(argumentsList));
    if (occurrence === undefined) {
      store.close();
      return { exitCode: 0, output: `${jobId}\tskipped\n` };
    }
    const now = nowFrom(argumentsList).toISOString();
    const stored = await new SqliteRunRepository(store).getOrCreate({
      jobId,
      occurrenceId: occurrence.id,
      status: 'scheduled',
      createdAt: now,
      updatedAt: now,
    });
    if (stored.created) await noOpRunner.start(occurrence);
    store.close();
    return {
      exitCode: 0,
      output: `${jobId}\t${stored.run.status}\t${occurrence.leaveAt}\n`,
    };
  }

  return { exitCode: 1, output: 'Unknown command\n' };
}

function optionValue(
  argumentsList: string[],
  option: string,
): string | undefined {
  const index = argumentsList.indexOf(option);
  return index === -1 ? undefined : argumentsList[index + 1];
}

function nowFrom(argumentsList: string[]): Date {
  const value = optionValue(argumentsList, '--now');
  const now = value === undefined ? new Date() : new Date(value);
  if (Number.isNaN(now.getTime()))
    throw new Error('--now must be an ISO timestamp');
  return now;
}

const noOpRunner: LectureRunner = {
  start: async () => undefined,
  stop: async () => undefined,
};
