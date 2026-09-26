import { readFile } from 'node:fs/promises';

import { parseJobConfig } from '../config/job-config.js';
import { Scheduler } from '../core/scheduler.js';
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

const noOpRunner = {
  start: async () => undefined,
  stop: async () => undefined,
};
