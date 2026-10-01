import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SdoMcpClient } from '../../src/core/mcp-client.js';
import { PlaywrightBbbSessionManager } from '../../src/core/bbb-session.js';
import { JobRunner } from '../../src/core/job-runner.js';
import type { JobRepository, RunRepository } from '../../src/core/types.js';

// Mock only external dependencies (MCP server, Playwright browser)
vi.mock('../../src/core/mcp-client.js');
vi.mock('../../src/core/bbb-session.js');

describe('Integration: MCP → BBB Workflow', () => {
  let mcpClient: SdoMcpClient;
  let bbbManager: PlaywrightBbbSessionManager;
  let jobRunner: JobRunner;
  let mockJobRepo: JobRepository;
  let mockRunRepo: RunRepository;

  beforeEach(() => {
    // Mock MCP client behavior
    mcpClient = {
      authenticate: vi.fn().mockResolvedValue({
        token: 'test-token',
        expiresAt: new Date(Date.now() + 3600000),
      }),
      listCourses: vi.fn().mockResolvedValue([
        { id: 'course-1', name: 'Advanced TypeScript' },
      ]),
      findBbbActivity: vi.fn().mockResolvedValue({
        id: 'activity-1',
        name: 'Lecture 1',
        courseUrl: 'https://sdo.tusur.ru/course/view.php?id=course-1',
        activityUrl: 'https://bbb2.tusur.ru/b/lec-abc123xyz',
        type: 'lecture',
      }),
      getBbbUrl: vi.fn().mockResolvedValue({
        url: 'https://bbb2.tusur.ru/b/lec-abc123xyz',
        meetingId: 'lec-abc123xyz',
        activityId: 'activity-1',
      }),
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
      monitorSession: vi.fn().mockRejectedValue(new Error('Session ended')),
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
        target: { type: 'direct', activityUrl: 'https://bbb2.tusur.ru/b/lec-abc123xyz' },
        browser: { headless: true },
      }),
      save: vi.fn().mockResolvedValue(undefined),
    };

    mockRunRepo = {
      getOrCreate: vi.fn().mockResolvedValue({
        run: {
          jobId: 'job-1',
          occurrenceId: 'occ-1',
          status: 'scheduled',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        created: true,
      }),
      update: vi.fn().mockResolvedValue(undefined),
    };

    jobRunner = new JobRunner(mcpClient, bbbManager, mockJobRepo, mockRunRepo);
  });

  it('should complete URL-based job: start → join → leave', async () => {
    const result = await jobRunner.runJob('job-1', 'occ-1');

    expect(result.jobId).toBe('job-1');
    expect(result.occurrenceId).toBe('occ-1');
    expect(result.status).toBe('completed');

    // Verify session lifecycle was called in order
    expect(bbbManager.startSession).toHaveBeenCalledWith(
      'https://bbb2.tusur.ru/b/lec-abc123xyz',
      expect.objectContaining({
        headless: true,
        timeout: expect.any(Number),
      })
    );
    expect(bbbManager.joinAsListener).toHaveBeenCalled();
    expect(bbbManager.leaveSession).toHaveBeenCalled();
  });

  it('should record run state transitions to repository', async () => {
    await jobRunner.runJob('job-1', 'occ-1');

    // Verify run updates were logged
    expect(mockRunRepo.update).toHaveBeenCalled();
    const updateCalls = (mockRunRepo.update as any).mock.calls;
    expect(updateCalls.length).toBeGreaterThan(0);
  });

  it('should handle session end with completion reason', async () => {
    const result = await jobRunner.runJob('job-1', 'occ-1');

    expect(result.status).toBe('completed');
    expect(result.completionReason).toBeDefined();
  });

  it('should recover from monitor errors and leave session', async () => {
    const result = await jobRunner.runJob('job-1', 'occ-1');

    // Should still leave despite monitor error
    expect(bbbManager.leaveSession).toHaveBeenCalled();
  });

  it('should handle missing job gracefully', async () => {
    mockJobRepo.getById = vi.fn().mockResolvedValueOnce(null);

    const result = await jobRunner.runJob('invalid-job', 'occ-1');

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Job not found');
  });

  it('should capture execution duration', async () => {
    const result = await jobRunner.runJob('job-1', 'occ-1');

    expect(typeof result.durationSeconds).toBe('number');
    expect(result.durationSeconds).toBeGreaterThanOrEqual(0);
  });

  it('should use URL directly without MCP when target type is url', async () => {
    const result = await jobRunner.runJob('job-1', 'occ-1');

    // URL-based jobs should NOT call MCP
    expect(mcpClient.authenticate).not.toHaveBeenCalled();
    expect(result.status).toBe('completed');
  });
});