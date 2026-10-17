import { access, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
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

  it('creates a missing parent directory for the database file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'online-lecture-'));
    temporaryDirectories.push(directory);
    const store = new SqliteStore(
      join(directory, 'missing', 'lectures.sqlite'),
    );

    await store.open();

    expect(store.migrationVersion()).toBe(1);
    store.close();
  });

  it('creates a local backup before a schedule change', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'online-lecture-'));
    temporaryDirectories.push(directory);
    const store = new SqliteStore(join(directory, 'lectures.sqlite'));
    await store.open();

    const backupPath = await store.createBackup();

    await expect(access(backupPath)).resolves.toBeUndefined();
    store.close();
  });

  it('recovers the latest backup after a database is corrupted', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'online-lecture-'));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, 'lectures.sqlite');
    const initial = new SqliteStore(databasePath);
    await initial.open();
    await initial.createBackup();
    initial.close();
    await writeFile(databasePath, 'not a sqlite database');

    const recovered = new SqliteStore(databasePath);
    const result = await recovered.openWithRecovery();

    expect(result.status).toBe('restored');
    expect(result.diagnosticPath).toContain('.corrupt-');
    expect(recovered.migrationVersion()).toBe(1);
    recovered.close();
  });

  it('loads SQLite through the given native binding', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'online-lecture-'));
    temporaryDirectories.push(directory);
    const store = new SqliteStore(join(directory, 'lectures.sqlite'), {
      nativeBinding: join(directory, 'missing.node'),
    });

    await expect(store.open()).rejects.toThrow();
  });

  it('keeps the database file when the SQLite module cannot load', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'online-lecture-'));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, 'lectures.sqlite');
    const initial = new SqliteStore(databasePath);
    await initial.open();
    initial.close();

    const store = new SqliteStore(databasePath, {
      nativeBinding: join(directory, 'missing.node'),
    });

    await expect(store.openWithRecovery()).rejects.toThrow();
    await expect(access(databasePath)).resolves.toBeUndefined();
    expect(
      (await readdir(directory)).filter((name) => name.includes('.corrupt-')),
    ).toEqual([]);
  });
});
