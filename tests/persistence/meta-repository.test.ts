import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { SqliteMetaRepository } from '../../src/persistence/meta-repository.js';
import { SqliteStore } from '../../src/persistence/sqlite-store.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  );
});

describe('SqliteMetaRepository', () => {
  it('stores and reads a value across reopen', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'online-lecture-'));
    directories.push(directory);
    const path = join(directory, 'lectures.sqlite');
    const store = new SqliteStore(path);
    await store.open();
    const meta = new SqliteMetaRepository(store);
    meta.set('k', 'one');
    meta.set('k', 'two');
    store.close();

    const reopened = new SqliteStore(path);
    await reopened.open();
    expect(new SqliteMetaRepository(reopened).get('k')).toBe('two');
    reopened.close();
  });

  it('returns undefined for a missing key', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'online-lecture-'));
    directories.push(directory);
    const store = new SqliteStore(join(directory, 'lectures.sqlite'));
    await store.open();
    expect(new SqliteMetaRepository(store).get('missing')).toBeUndefined();
    store.close();
  });
});
