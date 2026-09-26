import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { executeCli } from '../../src/cli/commands.js';

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
});
