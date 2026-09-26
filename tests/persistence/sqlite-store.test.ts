import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { SqliteStore } from '../../src/persistence/sqlite-store.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  );
});

describe('SqliteStore', () => {
  it('creates a new database and applies the initial migration', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'online-lecture-'));
    temporaryDirectories.push(directory);
    const store = new SqliteStore(join(directory, 'lectures.sqlite'));

    await store.open();

    expect(store.migrationVersion()).toBe(1);
    store.close();
  });
});
