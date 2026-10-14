import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeCli } from '../../src/cli/commands.js';
import { SqliteStore } from '../../src/persistence/sqlite-store.js';
import { SqliteJobRepository } from '../../src/persistence/job-repository.js';
import { SqliteRunRepository } from '../../src/persistence/run-repository.js';

const doubles = vi.hoisted(() => ({
  observe: vi.fn(),
  leave: vi.fn(),
  closeAll: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/core/mcp-client.js', () => ({
  SdoMcpClient: class {
    async close() {}
  },
}));
vi.mock('../../src/core/bbb-session.js', () => ({
  PlaywrightBbbSessionManager: class {
    async startSession() {
      return {
        page: {},
        status: 'started',
        url: 'https://bbb2.tusur.ru/test',
        startedAt: new Date(),
      };
    }
    async joinAsListener() {}
    observe = doubles.observe;
    leaveSession = doubles.leave;
    closeAll = doubles.closeAll;
  },
}));

describe('run-job signals', () => {
  let directory: string | undefined;
  afterEach(async () => {
    vi.useRealTimers();
    vi.clearAllMocks();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it.each(['SIGINT', 'SIGTERM'] as const)(
    'aborts only the active invocation and awaits browser cleanup on %s',
    async (event) => {
      directory = await mkdtemp(join(tmpdir(), 'lecture-signal-'));
      const databasePath = join(directory, 'test.db');
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-29T14:30:00Z'));
      const store = new SqliteStore(databasePath);
      await store.open();
      await new SqliteJobRepository(store).save({
        id: 'job-1',
        enabled: true,
        schedule: {
          type: 'once',
          date: '2026-09-29',
          joinAt: '14:00',
          leaveAt: '15:00',
          timezone: 'UTC',
        },
        target: { type: 'direct', activityUrl: 'https://bbb2.tusur.ru/test' },
        browser: { headless: true },
      });
      await new SqliteRunRepository(store).getOrCreate({
        jobId: 'job-1',
        occurrenceId: 'job-1:2026-09-29T14:00:00.000Z',
        status: 'scheduled',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      store.close();
      const initialListeners = process.listeners(event);
      let observed!: () => void;
      const ready = new Promise<void>((resolve) => {
        observed = resolve;
      });
      doubles.observe.mockImplementation(() => {
        observed();
        return new Promise(() => {});
      });
      let finishCleanup!: () => void;
      let cleanupStarted!: () => void;
      const leaving = new Promise<void>((resolve) => {
        cleanupStarted = resolve;
      });
      doubles.leave.mockImplementation(() => {
        cleanupStarted();
        return new Promise<void>((resolve) => {
          finishCleanup = resolve;
        });
      });
      const invocation = executeCli([
        'run-job',
        'job-1',
        'job-1:2026-09-29T14:00:00.000Z',
        '--db',
        databasePath,
      ]);
      await Promise.race([
        ready,
        invocation.then((result) => {
          throw new Error('Run ended before observation: ' + result.output);
        }),
      ]);
      expect(process.listeners(event)).toHaveLength(
        initialListeners.length + 1,
      );
      process.emit(event);
      await leaving;
      expect(doubles.leave).toHaveBeenCalledTimes(1);
      let settled = false;
      void invocation.then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      finishCleanup();
      expect(await invocation).toMatchObject({
        exitCode: 0,
        output: expect.stringContaining('manual'),
      });
      expect(process.listeners(event)).toEqual(initialListeners);
      expect(doubles.closeAll).toHaveBeenCalledTimes(1);
      await store.open();
      const { run } = await new SqliteRunRepository(store).getOrCreate({
        jobId: 'job-1',
        occurrenceId: 'job-1:2026-09-29T14:00:00.000Z',
        status: 'scheduled',
        createdAt: '',
        updatedAt: '',
      });
      expect(run).toMatchObject({
        status: 'completed',
        completionReason: 'manual',
      });
      store.close();
      await executeCli(['auth', 'check']);
      expect(process.listeners(event)).toEqual(initialListeners);
      await executeCli([
        'run-job',
        'job-1',
        'job-1:2026-09-29T14:00:00.000Z',
        '--db',
        databasePath,
      ]);
      expect(doubles.leave).toHaveBeenCalledTimes(1);
    },
  );
});
