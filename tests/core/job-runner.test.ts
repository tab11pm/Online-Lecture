import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JobRunner } from '../../src/core/job-runner.js';
import { UnsupportedBbbObservationError } from '../../src/core/bbb-session.js';
import { transitionRun } from '../../src/core/lifecycle.js';
import type { Job, Run, RunRepository } from '../../src/core/types.js';

describe('JobRunner lifecycle', () => {
  const occurrenceId = 'job-1:2026-09-29T14:00:00.000Z';
  let job: Job;
  let stored: Run | undefined;
  let manager: any;
  let runner: JobRunner;
  let repo: RunRepository;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-29T14:30:00Z'));
    job = {
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
      browser: { headless: false },
    };
    stored = undefined;
    repo = {
      getOrCreate: async (run) => {
        if (stored) return { run: stored, created: false };
        stored = run;
        return { run, created: true };
      },
      update: async (run) => {
        stored = run;
      },
      claimScheduled: async (_jobId, _occurrenceId, updatedAt) => {
        if (stored?.status !== 'scheduled') return undefined;
        stored = transitionRun(stored, 'resolving', updatedAt);
        return stored;
      },
      skipScheduled: async (_jobId, _occurrenceId, updatedAt) => {
        if (stored?.status !== 'scheduled') return undefined;
        stored = transitionRun(stored, 'skipped', updatedAt);
        return stored;
      },
    };
    manager = {
      startSession: vi.fn().mockResolvedValue({
        page: { reload: vi.fn().mockResolvedValue(undefined) },
        status: 'started',
        url: 'https://bbb2.tusur.ru/test',
        startedAt: new Date(),
      }),
      joinAsListener: vi.fn().mockResolvedValue(undefined),
      observe: vi.fn().mockResolvedValue({ kind: 'meeting_ended' }),
      leaveSession: vi.fn().mockResolvedValue(undefined),
    };
    manager.reconnect = vi.fn(async (session, signal) => {
      await manager.joinAsListener(session);
      return manager.observe(session, signal);
    });
    runner = new JobRunner(
      { resolveOnlineLecture: vi.fn(), close: vi.fn() } as any,
      manager,
      {
        getById: async () => job,
        listEnabled: async () => [job],
        save: async () => undefined,
      },
      repo,
    );
  });

  afterEach(() => vi.useRealTimers());

  it('persists meeting end from positive observations and closes once', async () => {
    const result = await runner.runJob('job-1', occurrenceId);
    expect(result).toMatchObject({
      status: 'completed',
      completionReason: 'meeting_ended',
    });
    expect(stored).toMatchObject({
      status: 'completed',
      completionReason: 'meeting_ended',
    });
    expect(manager.observe).toHaveBeenCalled();
    expect(manager.leaveSession).toHaveBeenCalledTimes(1);
  });

  it('resolves search targets through MCP without credentials', async () => {
    job.target = {
      type: 'search',
      courseName: 'Physics',
      lectureQuery: 'Optics',
    };
    const resolveOnlineLecture = vi.fn().mockResolvedValue({
      status: 'resolved',
      course: {
        name: 'Physics',
        url: 'https://sdo.tusur.ru/course/view.php?id=20',
      },
      module: {
        name: 'Optics',
        activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=201',
      },
    });
    runner = new JobRunner(
      { resolveOnlineLecture, close: vi.fn() } as any,
      manager,
      {
        getById: async () => job,
        listEnabled: async () => [job],
        save: async () => undefined,
      },
      repo,
    );

    const result = await runner.runJob('job-1', occurrenceId);

    expect(resolveOnlineLecture).toHaveBeenCalledWith({
      courseQuery: 'Physics',
      lectureQuery: 'Optics',
    });
    expect(result.status).toBe('completed');
    expect(manager.startSession).toHaveBeenCalledWith(
      'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=201',
      expect.any(Object),
      expect.any(AbortSignal),
    );
  });

  it.each([
    'job-1:2026-09-28T14:00:00.000Z',
    'missing',
    'job-1:2026-09-29T14:01:00.000Z',
  ])(
    'skips missing or expired exact occurrence %s without opening a browser',
    async (id) => {
      const result = await runner.runJob('job-1', id);
      expect(result.status).toBe('skipped');
      expect(stored?.status).toBe('skipped');
      expect(manager.startSession).not.toHaveBeenCalled();
    },
  );

  it('skips the exact leaveAt boundary', async () => {
    vi.setSystemTime(new Date('2026-09-29T15:00:00Z'));
    expect((await runner.runJob('job-1', occurrenceId)).status).toBe('skipped');
    expect(manager.startSession).not.toHaveBeenCalled();
  });

  it('stops at the occurrence deadline rather than a fixed monitor duration', async () => {
    vi.setSystemTime(new Date('2026-09-29T14:59:59Z'));
    manager.observe.mockResolvedValue({ kind: 'connected' });
    const promise = runner.runJob('job-1', occurrenceId);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await promise).toMatchObject({
      status: 'completed',
      completionReason: 'deadline',
    });
    expect(manager.leaveSession).toHaveBeenCalledTimes(1);
  });

  it('preserves unsupported observation as an explicit failure', async () => {
    manager.observe.mockRejectedValue(new UnsupportedBbbObservationError());
    expect(await runner.runJob('job-1', occurrenceId)).toMatchObject({
      status: 'failed',
      completionReason: 'error',
      error: expect.stringContaining('supported positive lifecycle signal'),
    });
    expect(stored?.status).toBe('failed');
    expect(manager.leaveSession).toHaveBeenCalledTimes(1);
  });

  it('blocks moderator removal without reconnecting', async () => {
    manager.observe.mockResolvedValue({ kind: 'moderator_removed' });
    expect((await runner.runJob('job-1', occurrenceId)).status).toBe('blocked');
    expect(manager.joinAsListener).toHaveBeenCalledTimes(1);
    expect(manager.leaveSession).toHaveBeenCalledTimes(1);
  });

  it('fails after the three scheduled reconnect delays', async () => {
    manager.observe.mockResolvedValue({
      kind: 'network_error',
      message: 'offline',
    });
    const promise = runner.runJob('job-1', occurrenceId);
    await vi.advanceTimersByTimeAsync(50_000);
    expect(await promise).toMatchObject({
      status: 'failed',
      completionReason: 'error',
    });
    expect(manager.joinAsListener).toHaveBeenCalledTimes(4);
    expect(manager.leaveSession).toHaveBeenCalledTimes(1);
  });

  it('does not execute a previously claimed occurrence again', async () => {
    await runner.runJob('job-1', occurrenceId);
    expect((await runner.runJob('job-1', occurrenceId)).status).toBe(
      'completed',
    );
    expect(manager.startSession).toHaveBeenCalledTimes(1);
  });

  it('starts an existing scheduled occurrence exactly once', async () => {
    stored = {
      jobId: 'job-1',
      occurrenceId,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect((await runner.runJob('job-1', occurrenceId)).status).toBe(
      'completed',
    );
    await runner.runJob('job-1', occurrenceId);
    expect(manager.startSession).toHaveBeenCalledTimes(1);
  });

  it('does not open a second browser while an occurrence is resolving', async () => {
    stored = {
      jobId: 'job-1',
      occurrenceId,
      status: 'resolving',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect((await runner.runJob('job-1', occurrenceId)).status).toBe(
      'resolving',
    );
    expect(manager.startSession).not.toHaveBeenCalled();
  });

  it('does not restart an existing terminal occurrence', async () => {
    stored = {
      jobId: 'job-1',
      occurrenceId,
      status: 'blocked',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect((await runner.runJob('job-1', occurrenceId)).status).toBe('blocked');
    expect(manager.startSession).not.toHaveBeenCalled();
  });

  it('preserves unsupported observation failure during reconnect', async () => {
    manager.observe.mockResolvedValue({
      kind: 'network_error',
      message: 'offline',
    });
    manager.reconnect.mockRejectedValue(new UnsupportedBbbObservationError());
    const promise = runner.runJob('job-1', occurrenceId);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await promise).toMatchObject({
      status: 'failed',
      completionReason: 'error',
      error: expect.stringContaining('supported positive lifecycle signal'),
    });
    expect(manager.leaveSession).toHaveBeenCalledTimes(1);
  });

  it('persists and redacts browser launch failure', async () => {
    manager.startSession.mockRejectedValue(
      new Error('Browser failed sessionToken=secret'),
    );
    const result = await runner.runJob('job-1', occurrenceId);
    expect(result).toMatchObject({
      status: 'failed',
      completionReason: 'error',
    });
    expect(result.error).not.toContain('secret');
    expect(stored?.status).toBe('failed');
  });

  it('does not launch when pre-aborted', async () => {
    const abort = new AbortController();
    abort.abort();
    const result = await runner.runJob('job-1', occurrenceId, abort.signal);
    expect(result).toMatchObject({
      status: 'completed',
      completionReason: 'manual',
    });
    expect(manager.startSession).not.toHaveBeenCalled();
  });

  it('does not launch when URL resolution crosses leaveAt', async () => {
    job.target = { type: 'search', courseName: 'course' };
    let finish!: (value: any) => void;
    const activity = new Promise<any>((resolve) => {
      finish = resolve;
    });
    runner = new JobRunner(
      {
        resolveOnlineLecture: vi.fn().mockReturnValue(activity),
        close: vi.fn().mockResolvedValue(undefined),
      } as any,
      manager,
      {
        getById: async () => job,
        listEnabled: async () => [job],
        save: async () => undefined,
      },
      {
        getOrCreate: async (run) => {
          if (stored) return { run: stored, created: false };
          stored = run;
          return { run, created: true };
        },
        update: async (run) => {
          stored = run;
        },
        claimScheduled: async (_jobId, _occurrenceId, updatedAt) => {
          if (stored?.status !== 'scheduled') return undefined;
          stored = transitionRun(stored, 'resolving', updatedAt);
          return stored;
        },
        skipScheduled: async () => undefined,
      },
    );
    vi.setSystemTime(new Date('2026-09-29T14:59:59Z'));
    const promise = runner.runJob('job-1', occurrenceId);
    await vi.advanceTimersByTimeAsync(1000);
    finish({ activityUrl: 'https://bbb2.tusur.ru/test' });
    expect(await promise).toMatchObject({
      status: 'completed',
      completionReason: 'deadline',
    });
    expect(manager.startSession).not.toHaveBeenCalled();
  });

  it('cleans a session created after cancellation during startSession', async () => {
    let finish!: (session: any) => void;
    manager.startSession.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const abort = new AbortController();
    const promise = runner.runJob('job-1', occurrenceId, abort.signal);
    await vi.advanceTimersByTimeAsync(0);
    abort.abort();
    finish({
      page: {},
      status: 'started',
      url: 'https://bbb2.tusur.ru/test',
      startedAt: new Date(),
    });
    expect(await promise).toMatchObject({
      status: 'completed',
      completionReason: 'manual',
    });
    expect(manager.leaveSession).toHaveBeenCalledTimes(1);
  });

  it.each(['manual', 'deadline'] as const)(
    'passes %s interruption into pending startup and waits for cleanup',
    async (reason) => {
      vi.setSystemTime(new Date('2026-09-29T14:59:59Z'));
      const abort = new AbortController();
      let finishCleanup!: () => void;
      let cleanupStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        cleanupStarted = resolve;
      });
      manager.startSession.mockImplementation(
        (_url: string, _config: unknown, startupSignal: AbortSignal) => {
          return new Promise((_resolve, reject) => {
            startupSignal.addEventListener(
              'abort',
              () => {
                cleanupStarted();
                finishCleanup = () =>
                  reject(new Error('Startup aborted after cleanup'));
              },
              { once: true },
            );
          });
        },
      );
      const promise = runner.runJob('job-1', occurrenceId, abort.signal);
      await vi.advanceTimersByTimeAsync(0);
      if (reason === 'manual') abort.abort();
      else await vi.advanceTimersByTimeAsync(1000);
      await started;
      let settled = false;
      void promise.then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      finishCleanup();
      expect(await promise).toMatchObject({
        status: 'completed',
        completionReason: reason,
      });
      expect(manager.joinAsListener).not.toHaveBeenCalled();
    },
  );

  it('retries an initial join network failure through the controller', async () => {
    manager.joinAsListener.mockRejectedValueOnce(
      new Error('offline sessionToken=secret'),
    );
    manager.reconnect.mockResolvedValue({ kind: 'connected' });
    manager.observe.mockResolvedValueOnce({ kind: 'meeting_ended' });
    const promise = runner.runJob('job-1', occurrenceId);
    await vi.advanceTimersByTimeAsync(6000);
    expect(await promise).toMatchObject({
      status: 'completed',
      completionReason: 'meeting_ended',
    });
    expect(manager.reconnect).toHaveBeenCalledTimes(1);
    expect(manager.leaveSession).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite a concurrent claim with stale skipped state', async () => {
    const originalGet = repo.getOrCreate;
    let claimInjected = false;
    repo.getOrCreate = async (run) => {
      const snapshot = await originalGet(run);
      if (!claimInjected) {
        stored = transitionRun(stored!, 'resolving', new Date().toISOString());
        claimInjected = true;
      }
      return snapshot;
    };
    const result = await runner.runJob('job-1', 'wrong-occurrence');
    expect(result.status).toBe('resolving');
    expect(stored?.status).toBe('resolving');
    expect(manager.startSession).not.toHaveBeenCalled();
  });

  it('flags authRequired when resolution needs a login', async () => {
    job.target = { type: 'search', courseName: 'Physics' };
    runner = new JobRunner(
      {
        resolveOnlineLecture: vi
          .fn()
          .mockResolvedValue({ status: 'auth_required' }),
        close: vi.fn(),
      } as unknown as ConstructorParameters<typeof JobRunner>[0],
      manager,
      {
        getById: async () => job,
        listEnabled: async () => [job],
        save: async () => undefined,
      },
      repo,
    );
    const result = await runner.runJob('job-1', occurrenceId);
    expect(result).toMatchObject({ status: 'failed', authRequired: true });
  });

  it.each([
    [{ status: 'auth_required' }, 'SDO authentication required'],
    [{ status: 'not_found' }, 'Online lecture not found'],
    [
      { status: 'ambiguous', candidates: [] },
      'Online lecture match is ambiguous',
    ],
  ])(
    'fails without a browser when resolution is %o',
    async (resolution, message) => {
      job.target = { type: 'search', courseName: 'Physics' };
      const close = vi.fn();
      runner = new JobRunner(
        {
          resolveOnlineLecture: vi.fn().mockResolvedValue(resolution),
          close,
        } as any,
        manager,
        {
          getById: async () => job,
          listEnabled: async () => [job],
          save: async () => undefined,
        },
        repo,
      );
      const result = await runner.runJob('job-1', occurrenceId);
      expect(result).toMatchObject({
        status: 'failed',
        completionReason: 'error',
        error: message,
      });
      expect(stored).toMatchObject({
        status: 'failed',
        completionReason: 'error',
      });
      expect(manager.startSession).not.toHaveBeenCalled();
      expect(close).toHaveBeenCalledOnce();
    },
  );
});
