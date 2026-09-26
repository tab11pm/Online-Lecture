import { readFile } from 'node:fs/promises';

import { parseJobConfig } from '../config/job-config.js';
import { SqliteJobRepository } from '../persistence/job-repository.js';
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

  return { exitCode: 1, output: 'Unknown command\n' };
}

function optionValue(
  argumentsList: string[],
  option: string,
): string | undefined {
  const index = argumentsList.indexOf(option);
  return index === -1 ? undefined : argumentsList[index + 1];
}
