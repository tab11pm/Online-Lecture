import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { SqliteRunRepository } from '../../src/persistence/run-repository.js';
import { SqliteStore } from '../../src/persistence/sqlite-store.js';
import type { Run } from '../../src/core/types.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  );
});

describe('SqliteRunRepository', () => {
  it('returns the original run when getOrCreate receives the same occurrence twice', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'online-lecture-'));
    directories.push(directory);
    const store = new SqliteStore(join(directory, 'lectures.sqlite'));
    await store.open();
    const repository = new SqliteRunRepository(store);
    const first: Run = {
      jobId: 'math',
      occurrenceId: 'math:2026-09-28T10:00:00.000+07:00',
      status: 'scheduled',
      createdAt: '2026-09-28T10:00:00.000+07:00',
      updatedAt: '2026-09-28T10:00:00.000+07:00',
    };

    const created = await repository.getOrCreate(first);
    const duplicate = await repository.getOrCreate({
      ...first,
      status: 'resolving',
    });

    expect(created).toEqual({ run: first, created: true });
    expect(duplicate).toEqual({ run: first, created: false });
    store.close();
  });
});
