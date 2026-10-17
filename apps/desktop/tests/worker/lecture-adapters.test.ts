import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DateTime } from 'luxon';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SdoMcpClient } from '@core/core/mcp-client.js';
import type { Job } from '@core/core/types.js';
import { SqliteJobRepository } from '@core/persistence/job-repository.js';
import { SqliteRunRepository } from '@core/persistence/run-repository.js';
import { SqliteStore } from '@core/persistence/sqlite-store.js';
import { createLectureAdapters } from '../../src/worker/lecture-adapters.js';

vi.mock('@core/core/browser-launch.js', () => ({
  assertBrowserAvailable: vi.fn(async () => {
    throw new Error(
      'Chromium не установлен. Установите Chromium в приложении.',
    );
  }),
}));

let dir: string;
let store: SqliteStore;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lecture-adapters-'));
  store = new SqliteStore(join(dir, 'lectures.db'));
  await store.open();
});

afterEach(async () => {
  store.close();
  await rm(dir, { recursive: true, force: true });
});

function directJob(): { job: Job; occurrenceId: string } {
  const zone = 'Asia/Krasnoyarsk';
  const start = DateTime.now().setZone(zone).minus({ minutes: 1 });
  const end = start.plus({ minutes: 60 });
  const joinAt = DateTime.fromISO(
    `${start.toISODate()}T${start.toFormat('HH:mm')}`,
    { zone },
  );
  const job: Job = {
    id: 'tt:direct:1',
    enabled: true,
    source: 'timetable',
    schedule: {
      type: 'imported',
      timezone: zone,
      occurrences: [
        {
          date: start.toISODate()!,
          joinAt: start.toFormat('HH:mm'),
          leaveAt: end.toFormat('HH:mm'),
        },
      ],
    },
    target: {
      type: 'direct',
      activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=1',
    },
    browser: { headless: true },
  };
  return { job, occurrenceId: `${job.id}:${joinAt.toISO()}` };
}

describe('createLectureAdapters', () => {
  it('resolves a manual target through MCP and closes the client', async () => {
    const close = vi.fn(async () => undefined);
    const resolveOnlineLecture = vi.fn(async () => ({ status: 'not_found' as const }));
    const adapters = createLectureAdapters({
      authStatePath: join(dir, 'auth.json'),
      createMcpClient: () => ({ close, resolveOnlineLecture }) as unknown as SdoMcpClient,
    });
    expect(await adapters.resolveManualTarget({ courseQuery: 'Алгебра' })).toEqual({ status: 'not_found' });
    expect(resolveOnlineLecture).toHaveBeenCalledWith({ courseQuery: 'Алгебра' });
    expect(close).toHaveBeenCalledOnce();
  });

  it('fails a run without launching when the chosen browser is missing', async () => {
    const jobs = new SqliteJobRepository(store);
    const runs = new SqliteRunRepository(store);
    const { job, occurrenceId } = directJob();
    await jobs.save(job);
    const close = vi.fn(async () => undefined);
    const adapters = createLectureAdapters({
      authStatePath: join(dir, 'auth.json'),
      createMcpClient: () => ({ close }) as unknown as SdoMcpClient,
    });

    const result = await adapters.runJob(
      jobs,
      runs,
      job.id,
      occurrenceId,
      new AbortController().signal,
      { headless: true },
    );

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Chromium не установлен');
    expect(await jobs.getById(job.id)).toBeDefined();
    const [run] = await runs.listAll();
    expect(run?.status).toBe('failed');
  });
});
