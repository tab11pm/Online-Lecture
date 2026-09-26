import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { executeCli } from '../../src/cli/commands.js';
import { SqliteJobRepository } from '../../src/persistence/job-repository.js';
import { SqliteStore } from '../../src/persistence/sqlite-store.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  );
});

describe('executeCli', () => {
  it('validates a YAML job file without creating a database', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'online-lecture-'));
    directories.push(directory);
    const configPath = join(directory, 'job.yml');
    await writeFile(
      configPath,
      'id: math\nenabled: true\nschedule:\n  type: once\n  date: "2026-09-28"\n  joinAt: "10:00"\n  leaveAt: "11:35"\n  timezone: Asia/Krasnoyarsk\ntarget:\n  type: search\n  course: "Математика"\nbrowser:\n  headless: false\n',
    );

    await expect(
      executeCli(['config', 'validate', '--config', configPath]),
    ).resolves.toEqual({
      exitCode: 0,
      output: 'Configuration is valid: math\n',
    });
  });

  it('reports that SDO MCP is not configured', async () => {
    await expect(executeCli(['auth', 'check'])).resolves.toEqual({
      exitCode: 2,
      output: 'SDO MCP adapter is not configured\n',
    });
  });

  it('lists enabled jobs from the selected local database', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'online-lecture-'));
    directories.push(directory);
    const databasePath = join(directory, 'lectures.sqlite');
    const store = new SqliteStore(databasePath);
    await store.open();
    await new SqliteJobRepository(store).save({
      id: 'math',
      enabled: true,
      schedule: {
        type: 'once',
        date: '2026-09-28',
        joinAt: '10:00',
        leaveAt: '11:35',
        timezone: 'Asia/Krasnoyarsk',
      },
      target: { type: 'search', course: 'Математика' },
      browser: { headless: false },
    });
    store.close();

    await expect(
      executeCli(['jobs', 'list', '--db', databasePath]),
    ).resolves.toEqual({
      exitCode: 0,
      output: 'math\tenabled\tonce\n',
    });
  });

  it('runs an active YAML job once without claiming a BBB connection', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'online-lecture-'));
    directories.push(directory);
    const configPath = join(directory, 'job.yml');
    const databasePath = join(directory, 'lectures.sqlite');
    await writeFile(
      configPath,
      'id: math\nenabled: true\nschedule:\n  type: once\n  date: "2026-09-28"\n  joinAt: "10:00"\n  leaveAt: "11:35"\n  timezone: Asia/Krasnoyarsk\ntarget:\n  type: search\n  course: "Математика"\nbrowser:\n  headless: false\n',
    );

    await expect(
      executeCli([
        'run',
        '--config',
        configPath,
        '--db',
        databasePath,
        '--now',
        '2026-09-28T03:15:00Z',
      ]),
    ).resolves.toEqual({ exitCode: 0, output: 'math\tscheduled\n' });
  });
});
