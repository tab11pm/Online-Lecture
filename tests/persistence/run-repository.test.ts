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
  it('cannot skip an occurrence already claimed by another invocation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'online-lecture-skip-'));
    directories.push(directory);
    const store = new SqliteStore(join(directory, 'lectures.sqlite'));
    const competingStore = new SqliteStore(join(directory, 'lectures.sqlite'));
    await store.open();
    await competingStore.open();
    const first = new SqliteRunRepository(store);
    const second = new SqliteRunRepository(competingStore);
    const scheduled: Run = {
      jobId: 'math',
      occurrenceId: 'occurrence',
      status: 'scheduled',
      createdAt: '2026-09-29T14:00:00Z',
      updatedAt: '2026-09-29T14:00:00Z',
    };
    await first.getOrCreate(scheduled);
    const claimed = await first.claimScheduled(
      'math',
      'occurrence',
      '2026-09-29T14:01:00Z',
    );
    expect(
      await second.skipScheduled('math', 'occurrence', '2026-09-29T14:02:00Z'),
    ).toBeUndefined();
    expect((await second.getOrCreate(scheduled)).run).toEqual(claimed);
    store.close();
    competingStore.close();
  });
  it('claims a scheduled occurrence once across repository instances', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'online-lecture-claim-'));
    directories.push(directory);
    const store = new SqliteStore(join(directory, 'lectures.sqlite'));
    await store.open();
    const first = new SqliteRunRepository(store);
    const secondStore = new SqliteStore(join(directory, 'lectures.sqlite'));
    await secondStore.open();
    const second = new SqliteRunRepository(secondStore);
    const scheduled: Run = {
      jobId: 'math',
      occurrenceId: 'occurrence',
      status: 'scheduled',
      createdAt: '2026-09-29T14:00:00Z',
      updatedAt: '2026-09-29T14:00:00Z',
    };
    await first.getOrCreate(scheduled);
    const claims = await Promise.all([
      first.claimScheduled('math', 'occurrence', '2026-09-29T14:01:00Z'),
      second.claimScheduled('math', 'occurrence', '2026-09-29T14:02:00Z'),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims[0]).toMatchObject({
      status: 'resolving',
      updatedAt: '2026-09-29T14:01:00Z',
    });
    expect((await first.getOrCreate(scheduled)).run).toEqual(claims[0]);
    await first.update({ ...claims[0]!, status: 'completed' });
    expect(
      await second.claimScheduled('math', 'occurrence', '2026-09-29T14:03:00Z'),
    ).toBeUndefined();
    expect(
      await second.claimScheduled('math', 'missing', '2026-09-29T14:03:00Z'),
    ).toBeUndefined();
    store.close();
    secondStore.close();
  });
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

  it('fails interrupted runs and leaves terminal ones untouched', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'online-lecture-recover-'));
    directories.push(directory);
    const store = new SqliteStore(join(directory, 'lectures.sqlite'));
    await store.open();
    const repo = new SqliteRunRepository(store);
    const make = (occurrenceId: string, status: Run['status']): Run => ({
      jobId: 'math',
      occurrenceId,
      status,
      createdAt: '2026-09-29T14:00:00Z',
      updatedAt: '2026-09-29T14:00:00Z',
    });
    for (const status of [
      'scheduled',
      'resolving',
      'joining',
      'waiting_room',
      'connected',
      'reconnecting',
      'leaving',
      'completed',
      'skipped',
      'blocked',
      'failed',
    ] as const) {
      await repo.getOrCreate(make(status, status));
    }

    expect(await repo.failInterrupted('2026-09-29T15:00:00Z')).toBe(6);

    const byId = new Map(
      (await repo.listAll()).map((run) => [run.occurrenceId, run]),
    );
    for (const id of [
      'resolving',
      'joining',
      'waiting_room',
      'connected',
      'reconnecting',
      'leaving',
    ]) {
      expect(byId.get(id)).toMatchObject({
        status: 'failed',
        completionReason: 'error',
        updatedAt: '2026-09-29T15:00:00Z',
      });
    }
    for (const id of [
      'scheduled',
      'completed',
      'skipped',
      'blocked',
      'failed',
    ]) {
      expect(byId.get(id)?.status).toBe(id);
      expect(byId.get(id)?.updatedAt).toBe('2026-09-29T14:00:00Z');
    }
    store.close();
  });

  it('lists all runs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'online-lecture-list-'));
    directories.push(directory);
    const store = new SqliteStore(join(directory, 'lectures.sqlite'));
    await store.open();
    const repo = new SqliteRunRepository(store);
    expect(await repo.listAll()).toEqual([]);
    const run: Run = {
      jobId: 'math',
      occurrenceId: 'a',
      status: 'scheduled',
      createdAt: '2026-09-29T14:00:00Z',
      updatedAt: '2026-09-29T14:00:00Z',
    };
    await repo.getOrCreate(run);
    expect(await repo.listAll()).toEqual([run]);
    store.close();
  });
});
