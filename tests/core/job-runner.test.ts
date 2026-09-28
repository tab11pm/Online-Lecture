import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies first
vi.mock('../../src/core/mcp-client.js');
vi.mock('../../src/core/bbb-session.js');

// Now import the class
import { JobRunner } from '../../src/core/job-runner.js';
import type { JobRepository, RunRepository } from '../../src/core/types.js';

describe('JobRunner', () => {
  let runner: JobRunner;
  let mockMcpClient: any;
  let mockBbbManager: any;
  let mockJobRepo: JobRepository;
  let mockRunRepo: RunRepository;

  beforeEach(() => {
    mockMcpClient = {
      authenticate: vi.fn().mockResolvedValue({
        token: 'test-token',
        expiresAt: new Date(Date.now() + 3600000),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };

    // Simulate immediate session end
    mockBbbManager = {
      startSession: vi.fn().mockResolvedValue({
        page: {},
        status: 'started',
        url: 'https://bbb2.tusur.ru/test',
        startedAt: new Date(),
      }),
      joinSession: vi.fn().mockResolvedValue(undefined),
      monitorSession: vi.fn().mockRejectedValue(new Error('Session monitoring timeout')),
      leaveSession: vi.fn().mockResolvedValue(undefined),
    };

    mockJobRepo = {
      listEnabled: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue({
        id: 'job-1',
        enabled: true,
        schedule: { type: 'once', date: '2026-09-28', joinAt: '14:00', leaveAt: '15:00', timezone: 'UTC' },
        target: { type: 'direct', activityUrl: 'https://bbb2.tusur.ru/test' },
        browser: { headless: false },
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

    runner = new JobRunner(
      mockMcpClient,
      mockBbbManager,
      mockJobRepo,
      mockRunRepo
    );
  });

  describe('runJob', () => {
    it('should accept jobId and occurrenceId parameters', async () => {
      const result = await runner.runJob('job-1', 'occ-1');

      expect(result).toHaveProperty('jobId', 'job-1');
      expect(result).toHaveProperty('occurrenceId', 'occ-1');
    });

    it('should return RunResult with required properties', async () => {
      const result = await runner.runJob('job-1', 'occ-1');

      expect(result).toHaveProperty('status');
      expect(result.status).toBeTruthy();
      expect(typeof result.durationSeconds).toBe('number');
    });

    it('should call startSession with URL and config', async () => {
      await runner.runJob('job-1', 'occ-1');

      expect(mockBbbManager.startSession).toHaveBeenCalledWith(
        'https://bbb2.tusur.ru/test',
        expect.objectContaining({
          headless: false,
        })
      );
    });

    it('should call joinSession', async () => {
      await runner.runJob('job-1', 'occ-1');

      expect(mockBbbManager.joinSession).toHaveBeenCalled();
    });

    it('should call leaveSession on completion', async () => {
      await runner.runJob('job-1', 'occ-1');

      expect(mockBbbManager.leaveSession).toHaveBeenCalled();
    });

    it('should handle job not found gracefully', async () => {
      (mockJobRepo.getById as any).mockResolvedValueOnce(null);

      const result = await runner.runJob('invalid-job', 'occ-1');

      expect(result.status).toBe('failed');
      expect(result.error).toBeTruthy();
    });

    it('should handle session start errors', async () => {
      (mockBbbManager.startSession as any).mockRejectedValueOnce(
        new Error('Browser failed')
      );

      const result = await runner.runJob('job-1', 'occ-1');

      expect(result.status).toBe('failed');
      expect(result.error?.includes('Browser failed')).toBe(true);
    });
  });
});