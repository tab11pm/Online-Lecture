import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Run } from '@core/core/types.js';
import { DesktopEventRepository } from '@core/persistence/desktop-event-repository.js';
import { SqliteRunRepository } from '@core/persistence/run-repository.js';
import { SqliteStore } from '@core/persistence/sqlite-store.js';
import { JournalService } from '../../src/worker/journal-service.js';

let directory: string;
let store: SqliteStore;
let events: DesktopEventRepository;
let runs: SqliteRunRepository;
let onNewEvent: ReturnType<typeof vi.fn>;
let journal: JournalService;

const at = '2026-10-19T10:00:00.000Z';
function run(status: Run['status'], failureCode?: Run['failureCode']): Run {
  return {
    jobId: 'math',
    occurrenceId: 'math:2026-10-19',
    status,
    createdAt: at,
    updatedAt: at,
    ...(failureCode ? { failureCode } : {}),
  };
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'desktop-journal-service-'));
  store = new SqliteStore(join(directory, 'lectures.sqlite'));
  await store.open();
  events = new DesktopEventRepository(store);
  runs = new SqliteRunRepository(store);
  onNewEvent = vi.fn();
  journal = new JournalService(events, onNewEvent, () => new Date(at));
});

afterEach(async () => {
  store.close();
  await rm(directory, { recursive: true, force: true });
});

describe('JournalService', () => {
  it('records one new completed run event and one notification callback', async () => {
    const completed = run('completed');
    await runs.getOrCreate(completed);

    await journal.recordTerminalRun(completed, 'Алгебра', true);

    expect((await journal.listPage('all')).items).toEqual([
      expect.objectContaining({ title: 'Алгебра', status: 'completed' }),
    ]);
    expect(onNewEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        code: 'lecture_finished',
        title: 'Алгебра',
        status: 'completed',
      }),
    );
  });

  it('does not notify twice for repeated terminal writes', async () => {
    const completed = run('completed');
    await runs.getOrCreate(completed);

    await journal.recordTerminalRun(completed, 'Алгебра', true);
    await journal.recordTerminalRun(completed, 'Алгебра', true);

    expect(onNewEvent).toHaveBeenCalledTimes(1);
    expect((await journal.listPage('all')).items).toHaveLength(1);
  });

  it('recovers a terminal event without notifying about old history', async () => {
    await runs.getOrCreate(run('failed', 'retries_exhausted'));

    await journal.recover();

    expect((await journal.listPage('errors')).items).toEqual([
      expect.objectContaining({
        status: 'failed',
        reason: 'retries_exhausted',
      }),
    ]);
    expect(onNewEvent).not.toHaveBeenCalled();
  });

  it('keeps skipped runs in history without notification', async () => {
    const skipped = run('skipped');
    await runs.getOrCreate(skipped);

    await journal.recordTerminalRun(skipped, 'Алгебра', true);

    expect((await journal.listPage('all')).items).toEqual([
      expect.objectContaining({ status: 'skipped' }),
    ]);
    expect(onNewEvent).not.toHaveBeenCalled();
  });

  it('persists the retry code through a database reopen', async () => {
    const failed = run('failed', 'retries_exhausted');
    await runs.getOrCreate(failed);
    await journal.recordTerminalRun(failed, 'Алгебра', true);
    store.close();
    store = new SqliteStore(join(directory, 'lectures.sqlite'));
    await store.open();
    journal = new JournalService(
      new DesktopEventRepository(store),
      onNewEvent,
      () => new Date(at),
    );

    expect((await journal.listPage('errors')).items[0]).toMatchObject({
      reason: 'retries_exhausted',
    });
  });
});
