import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { SqliteJobRepository } from '../../src/persistence/job-repository.js';
import { SqliteStore } from '../../src/persistence/sqlite-store.js';
import type { Job } from '../../src/core/types.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  );
});

describe('SqliteJobRepository', () => {
  it('persists jobs and lists only enabled ones', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'online-lecture-'));
    directories.push(directory);
    const store = new SqliteStore(join(directory, 'lectures.sqlite'));
    await store.open();
    const repository = new SqliteJobRepository(store);
    const enabled: Job = {
      id: 'math',
      enabled: true,
      schedule: {
        type: 'once',
        date: '2026-09-28',
        joinAt: '10:00',
        leaveAt: '11:35',
        timezone: 'Asia/Krasnoyarsk',
      },
      target: {
        type: 'direct',
        activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=42',
      },
      browser: { headless: false },
    };

    await repository.save(enabled);
    await repository.save({ ...enabled, id: 'disabled', enabled: false });

    expect(await repository.getById('math')).toEqual(enabled);
    expect(await repository.listEnabled()).toEqual([enabled]);
    store.close();
  });

  it('lists all jobs and deletes by id', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'online-lecture-'));
    directories.push(directory);
    const store = new SqliteStore(join(directory, 'lectures.sqlite'));
    await store.open();
    const repository = new SqliteJobRepository(store);
    const enabled: Job = {
      id: 'math',
      enabled: true,
      schedule: {
        type: 'once',
        date: '2026-09-28',
        joinAt: '10:00',
        leaveAt: '11:35',
        timezone: 'Asia/Krasnoyarsk',
      },
      target: {
        type: 'direct',
        activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=42',
      },
      browser: { headless: false },
    };

    await repository.save(enabled);
    expect((await repository.listAll()).map((j) => j.id)).toContain(enabled.id);
    await repository.delete(enabled.id);
    expect(await repository.getById(enabled.id)).toBeUndefined();
    store.close();
  });

  it('creates a backup before saving a schedule change', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'online-lecture-'));
    directories.push(directory);
    const store = new SqliteStore(join(directory, 'lectures.sqlite'));
    await store.open();
    const repository = new SqliteJobRepository(store);

    await repository.save({
      id: 'math',
      enabled: true,
      schedule: {
        type: 'once',
        date: '2026-09-28',
        joinAt: '10:00',
        leaveAt: '11:35',
        timezone: 'Asia/Krasnoyarsk',
      },
      target: { type: 'search', courseId: 'Математика' },
      browser: { headless: false },
    });

    expect(await readdir(join(directory, 'backups'))).toHaveLength(1);
    store.close();
  });
});
