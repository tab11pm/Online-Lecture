import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeCli } from '../../src/cli/commands.js';
import { SqliteStore } from '../../src/persistence/sqlite-store.js';
import { SqliteJobRepository } from '../../src/persistence/job-repository.js';
import { SdoMcpClient } from '../../src/core/mcp-client.js';
import { PlaywrightBbbSessionManager } from '../../src/core/bbb-session.js';
import { JobRunner } from '../../src/core/job-runner.js';
import { findActiveOccurrence } from '../../src/core/occurrence.js';
import type { JobRepository, RunRepository } from '../../src/core/types.js';

// Mock only external dependencies (MCP server, Playwright browser)
vi.mock('../../src/core/mcp-client.js');
vi.mock('../../src/core/bbb-session.js');

describe('CLI fixture contract', () => {
  it('validates and schedules the committed once fixture', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lecture-cli-fixture-'));
    const databasePath = join(directory, 'lectures.sqlite');
    const configPath = 'tests/fixtures/once-job.yml';
    const now = '2026-09-28T03:15:00Z';

    try {
      const validation = await executeCli([
        'config',
        'validate',
        '--config',
        configPath,
      ]);
      expect(validation.exitCode).toBe(0);
      expect(validation.output).toContain('math-once');

      const run = await executeCli([
        'run',
        '--config',
        configPath,
        '--db',
        databasePath,
        '--now',
        now,
      ]);
      expect(run.exitCode).toBe(0);
      expect(run.output).toBe('math-once\tscheduled\n');

      const jobs = await executeCli(['jobs', 'list', '--db', databasePath]);
      expect(jobs.exitCode).toBe(0);
      expect(jobs.output).toBe('math-once\tenabled\tonce\n');

      const store = new SqliteStore(databasePath);
      await store.open();
      try {
        const stored = await new SqliteJobRepository(store).getById(
          'math-once',
        );
        expect(stored?.target).toEqual({
          type: 'direct',
          activityUrl:
            'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=42',
        });
      } finally {
        store.close();
      }

      const runOnce = await executeCli([
        'run-once',
        'math-once',
        '--db',
        databasePath,
        '--now',
        now,
      ]);
      expect(runOnce.exitCode).toBe(0);
      expect(runOnce.output).toBe(
        'math-once\tscheduled\t2026-09-28T11:35:00.000+07:00\n',
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe('Integration: MCP → BBB Workflow', () => {
  let mcpClient: SdoMcpClient;
  let bbbManager: PlaywrightBbbSessionManager;
  let jobRunner: JobRunner;
  let mockJobRepo: JobRepository;
  let mockRunRepo: RunRepository;
  let occurrenceId: string;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-28T14:30:00Z'));
    // Mock MCP client behavior
    mcpClient = {
      resolveOnlineLecture: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    } as any;

    // Mock BBB session manager - simulate immediate disconnect
    bbbManager = {
      startSession: vi.fn().mockResolvedValue({
        page: { url: () => 'https://bbb2.tusur.ru/b/lec-abc123xyz' },
        status: 'started',
        url: 'https://bbb2.tusur.ru/b/lec-abc123xyz',
        startedAt: new Date(),
      }),
      joinAsListener: vi.fn().mockResolvedValue(undefined),
      observe: vi.fn().mockResolvedValue({ kind: 'meeting_ended' }),
      reconnect: vi.fn().mockResolvedValue({ kind: 'connected' }),
      leaveSession: vi.fn().mockResolvedValue(undefined),
      closeAll: vi.fn().mockResolvedValue(undefined),
    } as any;

    // Mock repositories
    mockJobRepo = {
      listEnabled: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue({
        id: 'job-1',
        enabled: true,
        schedule: {
          type: 'once',
          date: '2026-09-28',
          joinAt: '14:00',
          leaveAt: '15:00',
          timezone: 'UTC',
        },
        target: {
          type: 'direct',
          activityUrl:
            'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=42',
        },
        browser: { headless: true },
      }),
      save: vi.fn().mockResolvedValue(undefined),
    };

    mockRunRepo = {
      getOrCreate: vi
        .fn()
        .mockImplementation(async (run) => ({ run, created: true })),
      claimScheduled: vi
        .fn()
        .mockImplementation(async (jobId, occurrenceId, updatedAt) => ({
          jobId,
          occurrenceId,
          status: 'resolving',
          createdAt: updatedAt,
          updatedAt,
        })),
      skipScheduled: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    };

    jobRunner = new JobRunner(mcpClient, bbbManager, mockJobRepo, mockRunRepo);
  });
  beforeEach(async () => {
    occurrenceId = findActiveOccurrence(
      (await mockJobRepo.getById('job-1'))!,
      new Date(),
    )!.id;
  });
  afterEach(() => vi.useRealTimers());

  it('should complete direct activity job: start → join → leave', async () => {
    const result = await jobRunner.runJob('job-1', occurrenceId);

    expect(result.jobId).toBe('job-1');
    expect(result.occurrenceId).toBe(occurrenceId);
    expect(result.status).toBe('completed');

    // Verify session lifecycle was called in order
    expect(bbbManager.startSession).toHaveBeenCalledWith(
      'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=42',
      expect.objectContaining({
        headless: true,
        timeout: expect.any(Number),
      }),
      expect.any(AbortSignal),
    );
    expect(bbbManager.joinAsListener).toHaveBeenCalled();
    expect(bbbManager.observe).toHaveBeenCalled();
    expect(bbbManager.leaveSession).toHaveBeenCalled();
  });

  it('should record run state transitions to repository', async () => {
    await jobRunner.runJob('job-1', occurrenceId);

    // Verify run updates were logged
    expect(mockRunRepo.update).toHaveBeenCalled();
    const updateCalls = (mockRunRepo.update as any).mock.calls;
    expect(updateCalls.length).toBeGreaterThan(0);
  });

  it('should handle session end with completion reason', async () => {
    const result = await jobRunner.runJob('job-1', occurrenceId);

    expect(result.status).toBe('completed');
    expect(result.completionReason).toBe('meeting_ended');
  });

  it('fails on unsupported observation and leaves session', async () => {
    vi.mocked(bbbManager.observe).mockRejectedValueOnce(
      new Error('Unsupported BBB observation'),
    );
    const result = await jobRunner.runJob('job-1', occurrenceId);

    // Should still leave despite monitor error
    expect(bbbManager.leaveSession).toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'failed',
      completionReason: 'error',
    });
  });

  it('should handle missing job gracefully', async () => {
    mockJobRepo.getById = vi.fn().mockResolvedValueOnce(null);

    const result = await jobRunner.runJob('invalid-job', occurrenceId);

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Job not found');
  });

  it('should capture execution duration', async () => {
    const result = await jobRunner.runJob('job-1', occurrenceId);

    expect(typeof result.durationSeconds).toBe('number');
    expect(result.durationSeconds).toBeGreaterThanOrEqual(0);
  });

  it('should use activity URL directly without MCP when target type is direct', async () => {
    const result = await jobRunner.runJob('job-1', occurrenceId);

    // Direct activity jobs should NOT call MCP
    expect(mcpClient.resolveOnlineLecture).not.toHaveBeenCalled();
    expect(result.status).toBe('completed');
  });
});
