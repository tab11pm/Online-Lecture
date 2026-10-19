import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DesktopEventRepository } from '../../src/persistence/desktop-event-repository.js';
import { SqliteRunRepository } from '../../src/persistence/run-repository.js';
import { SqliteStore } from '../../src/persistence/sqlite-store.js';
import type { Run } from '../../src/core/types.js';

const stores: SqliteStore[] = [];
const directories: string[] = [];

async function setup(): Promise<{
  store: SqliteStore;
  events: DesktopEventRepository;
  runs: SqliteRunRepository;
}> {
  const directory = await mkdtemp(join(tmpdir(), 'online-lecture-journal-'));
  directories.push(directory);
  const store = new SqliteStore(join(directory, 'lectures.sqlite'));
  stores.push(store);
  await store.open();
  return {
    store,
    events: new DesktopEventRepository(store),
    runs: new SqliteRunRepository(store),
  };
}

function run(
  jobId: string,
  status: Run['status'],
  at = '2026-10-19T10:00:00.000Z',
): Run {
  return {
    jobId,
    occurrenceId: `${jobId}:2026-10-19`,
    status,
    createdAt: at,
    updatedAt: at,
  };
}

afterEach(async () => {
  for (const store of stores.splice(0)) store.close();
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  );
});

describe('DesktopEventRepository', () => {
  it('keeps a completed run in history after its job is deleted', async () => {
    const { store, events, runs } = await setup();
    await runs.getOrCreate(run('manual:1', 'completed'));
    await events.insert({
      key: 'terminal:manual:1:manual:1:2026-10-19:completed',
      code: 'lecture_finished',
      at: '2026-10-19T10:00:00.000Z',
      title: 'Алгебра',
      jobId: 'manual:1',
      occurrenceId: 'manual:1:2026-10-19',
    });
    store
      .getDatabase()
      .prepare('DELETE FROM jobs WHERE id = ?')
      .run('manual:1');

    const page = await events.listPage('all');

    expect(page.records).toHaveLength(1);
    expect(page.records[0]).toMatchObject({
      title: 'Алгебра',
      status: 'completed',
    });
  });

  it('returns 50 newest rows and stable next cursor when a newer event arrives', async () => {
    const { events } = await setup();
    for (let index = 0; index < 52; index += 1) {
      await events.insert({
        key: `error:${index}`,
        code: 'import_error',
        at: new Date(Date.UTC(2026, 9, 19, 10, 0, index)).toISOString(),
      });
    }

    const first = await events.listPage('all');
    expect(first.records).toHaveLength(50);
    expect(first.records[0]?.at).toBe('2026-10-19T10:00:51.000Z');
    expect(first.nextCursor).toBeDefined();
    await events.insert({
      key: 'error:new',
      code: 'import_error',
      at: '2026-10-19T10:01:00.000Z',
    });
    const second = await events.listPage('all', first.nextCursor);

    expect(second.records.map((entry) => entry.at)).toEqual([
      '2026-10-19T10:00:01.000Z',
      '2026-10-19T10:00:00.000Z',
    ]);
    expect(second.nextCursor).toBeUndefined();
  });

  it('filters failed and blocked runs plus error events', async () => {
    const { events, runs } = await setup();
    await runs.getOrCreate(run('done', 'completed'));
    await runs.getOrCreate(run('failed', 'failed'));
    await runs.getOrCreate(run('blocked', 'blocked'));
    await events.insert({
      key: 'login:1',
      code: 'login_succeeded',
      at: '2026-10-19T10:00:01.000Z',
    });
    await events.insert({
      key: 'error:1',
      code: 'import_error',
      at: '2026-10-19T10:00:02.000Z',
    });

    const page = await events.listPage('errors');

    expect(page.records.map((entry) => entry.status).sort()).toEqual([
      'blocked',
      'failed',
      'import_error',
    ]);
  });

  it('rejects a malformed page cursor', async () => {
    const { events } = await setup();

    await expect(events.listPage('all', 'not-a-cursor')).rejects.toThrow();
  });

  it('deduplicates a key and redacts an external title before storage', async () => {
    const { store, events } = await setup();
    const input = {
      key: 'lookup:1',
      code: 'search_ambiguous' as const,
      at: '2026-10-19T10:00:00.000Z',
      title: 'Курс https://sdo.tusur.ru/?sessionToken=secret',
    };

    const first = await events.insert(input);
    const second = await events.insert(input);
    const row = store
      .getDatabase()
      .prepare('SELECT title FROM desktop_events WHERE event_key = ?')
      .get(input.key) as { title: string };

    expect(first.created).toBe(true);
    expect(second).toEqual({ id: first.id, created: false });
    expect(row.title).toBe('Курс [REDACTED_URL]');
  });

  it('recovers one event for a terminal run without one', async () => {
    const { events, runs } = await setup();
    await runs.getOrCreate(run('orphan', 'failed'));

    expect(await events.recoverTerminalRuns()).toBe(1);
    expect(await events.recoverTerminalRuns()).toBe(0);
    expect((await events.listPage('all')).records).toHaveLength(1);
  });
});
