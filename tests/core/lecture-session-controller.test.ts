import { describe, expect, it, vi } from 'vitest';

import { LectureSessionController } from '../../src/core/lecture-session-controller.js';
import type {
  BbbObservation,
  BbbSession,
  BbbSessionPort,
  LectureSessionControllerDependencies,
  Occurrence,
  Run,
} from '../../src/core/types.js';

function setup() {
  const startingRun: Run = {
    jobId: 'lecture',
    occurrenceId: 'lecture:2026-09-29T10:00:00Z',
    status: 'joining',
    createdAt: '2026-09-29T10:00:00Z',
    updatedAt: '2026-09-29T10:00:00Z',
  };
  const occurrence: Occurrence = {
    id: startingRun.occurrenceId,
    jobId: 'lecture',
    joinAt: startingRun.createdAt,
    leaveAt: '2026-09-29T11:35:00Z',
    timezone: 'UTC',
  };
  const session: BbbSession = {
    page: {},
    status: 'starting',
    url: 'https://bbb.example.test/lecture',
    startedAt: new Date(startingRun.createdAt),
  };
  const abortController = new AbortController();
  const persistedRuns: Run[] = [];
  const dependencies: LectureSessionControllerDependencies = {
    now: vi.fn(() => new Date('2026-09-29T11:00:00Z')),
    sleep: vi.fn(async () => {}),
    update: vi.fn(async (run: Run) => {
      persistedRuns.push(run);
      return run;
    }),
  };
  const port = {
    join: vi.fn(
      async (
        _session: BbbSession,
        _signal: AbortSignal,
      ): Promise<BbbObservation> => ({ kind: 'connected' }),
    ),
    observe: vi.fn(
      async (
        _session: BbbSession,
        _signal: AbortSignal,
      ): Promise<BbbObservation> => ({
        kind: 'meeting_ended',
      }),
    ),
    reconnect: vi.fn(
      async (
        _session: BbbSession,
        _signal: AbortSignal,
      ): Promise<BbbObservation> => ({
        kind: 'connected',
      }),
    ),
    leave: vi.fn(async () => {}),
  } satisfies BbbSessionPort;
  const controller = new LectureSessionController(dependencies);
  const run = () =>
    controller.run(
      startingRun,
      occurrence,
      session,
      port,
      abortController.signal,
    );
  return {
    startingRun,
    occurrence,
    session,
    abortController,
    persistedRuns,
    dependencies,
    port,
    run,
  };
}

describe('lecture session controller', () => {
  it.each(['join', 'observe', 'reconnect'] as const)(
    'starts leaving at the deadline while %s never settles',
    async (operation) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-29T11:34:58Z'));
      try {
        const f = setup();
        vi.mocked(f.dependencies.now).mockImplementation(() => new Date());
        let operationSignal: AbortSignal | undefined;
        const pending = vi.fn((_session: BbbSession, signal: AbortSignal) => {
          operationSignal = signal;
          return new Promise<BbbObservation>(() => {});
        });
        f.port[operation] = pending;
        if (operation === 'reconnect') {
          f.port.join.mockResolvedValue({
            kind: 'network_error',
            message: 'Connection lost',
          });
        }
        const result = f.run();
        await vi.advanceTimersByTimeAsync(0);
        expect(pending).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(1_999);
        expect(f.port.leave).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);

        expect(f.port.leave).toHaveBeenCalledExactlyOnceWith(f.session);
        expect(operationSignal?.aborted).toBe(true);
        expect(await result).toMatchObject({
          status: 'completed',
          completionReason: 'deadline',
        });
        expect(f.persistedRuns.slice(-2).map((run) => run.status)).toEqual([
          'leaving',
          'completed',
        ]);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('keeps confirmed moderator removal blocked when cleanup rejects', async () => {
    const f = setup();
    f.port.observe.mockResolvedValue({ kind: 'moderator_removed' });
    f.port.leave.mockRejectedValue(
      new Error('Cleanup failed with private session URL'),
    );

    expect(await f.run()).toMatchObject({ status: 'blocked' });
    expect(f.persistedRuns.slice(-2).map((run) => run.status)).toEqual([
      'leaving',
      'blocked',
    ]);
    expect(f.port.leave).toHaveBeenCalledOnce();
    expect(f.port.reconnect).not.toHaveBeenCalled();
    expect(f.dependencies.sleep).not.toHaveBeenCalled();
    expect(JSON.stringify(f.persistedRuns)).not.toContain(
      'private session URL',
    );
  });

  it('interrupts a pending observation on caller cancellation and removes the deadline timer', async () => {
    vi.useFakeTimers();
    try {
      const f = setup();
      const removeListener = vi.spyOn(
        f.abortController.signal,
        'removeEventListener',
      );
      let operationSignal: AbortSignal | undefined;
      f.port.observe.mockImplementation((_session, signal) => {
        operationSignal = signal;
        return new Promise<BbbObservation>(() => {});
      });
      const result = f.run();
      await vi.advanceTimersByTimeAsync(0);
      f.abortController.abort();

      expect(await result).toMatchObject({
        status: 'completed',
        completionReason: 'manual',
      });
      expect(operationSignal?.aborted).toBe(true);
      expect(f.port.leave).toHaveBeenCalledExactlyOnceWith(f.session);
      expect(removeListener).toHaveBeenCalledWith(
        'abort',
        expect.any(Function),
      );
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the timer and caller listener after normal completion', async () => {
    vi.useFakeTimers();
    try {
      const f = setup();
      const removeListener = vi.spyOn(
        f.abortController.signal,
        'removeEventListener',
      );

      expect(await f.run()).toMatchObject({
        status: 'completed',
        completionReason: 'meeting_ended',
      });
      expect(vi.getTimerCount()).toBe(0);
      expect(removeListener).toHaveBeenCalledWith(
        'abort',
        expect.any(Function),
      );
      await vi.advanceTimersByTimeAsync(3_600_000);
      expect(f.port.leave).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not start a port operation after queued cancellation', async () => {
    const f = setup();
    vi.mocked(f.dependencies.now).mockImplementationOnce(() => {
      queueMicrotask(() => f.abortController.abort());
      return new Date('2026-09-29T11:00:00Z');
    });

    expect(await f.run()).toMatchObject({
      status: 'completed',
      completionReason: 'manual',
    });
    expect(f.port.join).not.toHaveBeenCalled();
    expect(f.port.leave).toHaveBeenCalledOnce();
  });

  it('leaves at leaveAt before attempting to join or reconnect', async () => {
    const f = setup();
    vi.mocked(f.dependencies.now).mockReturnValue(
      new Date(f.occurrence.leaveAt),
    );
    f.port.join.mockResolvedValue({
      kind: 'network_error',
      message: 'Connection lost',
    });

    expect(await f.run()).toMatchObject({
      status: 'completed',
      completionReason: 'deadline',
    });
    expect(f.persistedRuns.map((run) => run.status)).toEqual([
      'leaving',
      'completed',
    ]);
    expect(f.port.join).not.toHaveBeenCalled();
    expect(f.port.reconnect).not.toHaveBeenCalled();
    expect(f.port.leave).toHaveBeenCalledExactlyOnceWith(f.session);
  });

  it('completes with manual reason when the signal is already aborted', async () => {
    const f = setup();
    f.abortController.abort();

    expect(await f.run()).toMatchObject({
      status: 'completed',
      completionReason: 'manual',
    });
    expect(f.port.join).not.toHaveBeenCalled();
    expect(f.port.observe).not.toHaveBeenCalled();
    expect(f.port.leave).toHaveBeenCalledExactlyOnceWith(f.session);
    expect(f.persistedRuns.map((run) => run.status)).toEqual([
      'leaving',
      'completed',
    ]);
  });

  it('checks the deadline again before observing a joined session', async () => {
    const f = setup();
    f.port.join.mockImplementation(async () => {
      vi.mocked(f.dependencies.now).mockReturnValue(
        new Date(f.occurrence.leaveAt),
      );
      return { kind: 'connected' };
    });

    expect(await f.run()).toMatchObject({
      status: 'completed',
      completionReason: 'deadline',
    });
    expect(f.port.observe).not.toHaveBeenCalled();
    expect(f.port.leave).toHaveBeenCalledOnce();
  });

  it('retries technical failures after 5, 15, and 30 seconds then fails', async () => {
    const f = setup();
    const failure: BbbObservation = {
      kind: 'network_error',
      message: 'Connection lost',
    };
    f.port.join.mockResolvedValue(failure);
    f.port.reconnect.mockResolvedValue(failure);

    expect(await f.run()).toMatchObject({
      status: 'failed',
      completionReason: 'error',
    });
    expect(f.dependencies.sleep).toHaveBeenNthCalledWith(
      1,
      5_000,
      expect.any(AbortSignal),
    );
    expect(f.dependencies.sleep).toHaveBeenNthCalledWith(
      2,
      15_000,
      expect.any(AbortSignal),
    );
    expect(f.dependencies.sleep).toHaveBeenNthCalledWith(
      3,
      30_000,
      expect.any(AbortSignal),
    );
    expect(f.port.reconnect).toHaveBeenCalledTimes(3);
    expect(f.port.leave).toHaveBeenCalledExactlyOnceWith(f.session);
    expect(f.persistedRuns.map((run) => run.status)).toEqual([
      'reconnecting',
      'joining',
      'reconnecting',
      'joining',
      'reconnecting',
      'joining',
      'leaving',
      'failed',
    ]);
  });

  it('leaves instead of sleeping when a technical failure reaches the deadline', async () => {
    const f = setup();
    f.port.join.mockImplementation(async () => {
      vi.mocked(f.dependencies.now).mockReturnValue(
        new Date(f.occurrence.leaveAt),
      );
      return { kind: 'network_error', message: 'Connection lost' };
    });

    expect(await f.run()).toMatchObject({
      status: 'completed',
      completionReason: 'deadline',
    });
    expect(f.dependencies.sleep).not.toHaveBeenCalled();
    expect(f.port.reconnect).not.toHaveBeenCalled();
  });

  it('does not reconnect when the retry wait reaches the deadline', async () => {
    const f = setup();
    f.port.join.mockResolvedValue({
      kind: 'network_error',
      message: 'Connection lost',
    });
    vi.mocked(f.dependencies.sleep).mockImplementation(async () => {
      vi.mocked(f.dependencies.now).mockReturnValue(
        new Date(f.occurrence.leaveAt),
      );
    });

    expect(await f.run()).toMatchObject({
      status: 'completed',
      completionReason: 'deadline',
    });
    expect(f.port.reconnect).not.toHaveBeenCalled();
    expect(f.persistedRuns.map((run) => run.status)).toEqual([
      'reconnecting',
      'leaving',
      'completed',
    ]);
  });

  it('does not sleep past the remaining lecture time', async () => {
    const f = setup();
    vi.mocked(f.dependencies.now).mockReturnValue(
      new Date('2026-09-29T11:34:58Z'),
    );
    f.port.join.mockResolvedValue({
      kind: 'network_error',
      message: 'Connection lost',
    });
    vi.mocked(f.dependencies.sleep).mockImplementation(async () => {
      vi.mocked(f.dependencies.now).mockReturnValue(
        new Date(f.occurrence.leaveAt),
      );
    });

    expect(await f.run()).toMatchObject({
      status: 'completed',
      completionReason: 'deadline',
    });
    expect(f.dependencies.sleep).toHaveBeenCalledExactlyOnceWith(
      2_000,
      expect.any(AbortSignal),
    );
    expect(f.port.reconnect).not.toHaveBeenCalled();
  });

  it.each(['join', 'observe', 'sleep'] as const)(
    'cleans up a cancellation that rejects %s',
    async (operation) => {
      const f = setup();
      const rejectOnAbort = async (): Promise<never> => {
        f.abortController.abort();
        throw new Error('Operation aborted');
      };
      if (operation === 'sleep') {
        f.port.join.mockResolvedValue({
          kind: 'network_error',
          message: 'Connection lost',
        });
        vi.mocked(f.dependencies.sleep).mockImplementation(rejectOnAbort);
      } else {
        f.port[operation].mockImplementation(rejectOnAbort);
      }

      expect(await f.run()).toMatchObject({
        status: 'completed',
        completionReason: 'manual',
      });
      expect(f.port.leave).toHaveBeenCalledExactlyOnceWith(f.session);
      expect(f.port.reconnect).not.toHaveBeenCalled();
      expect(f.persistedRuns.slice(-2).map((run) => run.status)).toEqual([
        'leaving',
        'completed',
      ]);
    },
  );

  it('waits for positive connection evidence before becoming connected', async () => {
    const f = setup();
    f.port.join.mockResolvedValue({ kind: 'waiting_room' });
    f.port.observe
      .mockResolvedValueOnce({ kind: 'waiting_room' })
      .mockResolvedValueOnce({ kind: 'connected' })
      .mockResolvedValueOnce({ kind: 'meeting_ended' });

    expect(await f.run()).toMatchObject({
      status: 'completed',
      completionReason: 'meeting_ended',
    });
    expect(f.persistedRuns.map((run) => run.status)).toEqual([
      'waiting_room',
      'connected',
      'leaving',
      'completed',
    ]);
    expect(f.port.reconnect).not.toHaveBeenCalled();
  });

  it('reconnects a connected session after a network error', async () => {
    const f = setup();
    f.port.observe
      .mockResolvedValueOnce({
        kind: 'network_error',
        message: 'Connection lost',
      })
      .mockResolvedValueOnce({ kind: 'meeting_ended' });

    expect(await f.run()).toMatchObject({
      status: 'completed',
      completionReason: 'meeting_ended',
    });
    expect(f.persistedRuns.map((run) => run.status)).toEqual([
      'connected',
      'reconnecting',
      'joining',
      'connected',
      'leaving',
      'completed',
    ]);
    expect(f.port.reconnect).toHaveBeenCalledExactlyOnceWith(
      f.session,
      expect.any(AbortSignal),
    );
  });

  it.each(['joining', 'connected', 'waiting_room'] as const)(
    'blocks confirmed moderator removal while %s',
    async (status) => {
      const f = setup();
      if (status === 'joining') {
        f.port.join.mockResolvedValue({ kind: 'moderator_removed' });
      } else {
        f.port.join.mockResolvedValue({ kind: status });
        f.port.observe.mockResolvedValue({ kind: 'moderator_removed' });
      }

      expect(await f.run()).toMatchObject({ status: 'blocked' });
      expect(f.persistedRuns.slice(-2).map((run) => run.status)).toEqual([
        'leaving',
        'blocked',
      ]);
      expect(f.port.leave).toHaveBeenCalledExactlyOnceWith(f.session);
      expect(f.dependencies.sleep).not.toHaveBeenCalled();
      expect(f.port.reconnect).not.toHaveBeenCalled();
    },
  );

  it('persists failure after cleaning up an unexpected port error', async () => {
    const f = setup();
    f.port.observe.mockRejectedValue(
      new Error('Unexpected observation failure'),
    );

    expect(await f.run()).toMatchObject({
      status: 'failed',
      completionReason: 'error',
    });
    expect(f.persistedRuns.map((run) => run.status)).toEqual([
      'connected',
      'leaving',
      'failed',
    ]);
    expect(f.port.leave).toHaveBeenCalledExactlyOnceWith(f.session);
  });

  it('persists an error when session cleanup fails', async () => {
    const f = setup();
    f.port.leave.mockRejectedValue(new Error('Browser close failed'));

    expect(await f.run()).toMatchObject({
      status: 'failed',
      completionReason: 'error',
    });
    expect(f.persistedRuns.map((run) => run.status)).toEqual([
      'connected',
      'leaving',
      'failed',
    ]);
    expect(f.port.leave).toHaveBeenCalledOnce();
  });

  it('retries a waiting-room network error without treating it as moderator removal', async () => {
    const f = setup();
    f.port.join.mockResolvedValue({ kind: 'waiting_room' });
    f.port.observe
      .mockResolvedValueOnce({
        kind: 'network_error',
        message: 'Connection lost',
      })
      .mockResolvedValueOnce({ kind: 'connected' })
      .mockResolvedValueOnce({ kind: 'meeting_ended' });

    expect(await f.run()).toMatchObject({
      status: 'completed',
      completionReason: 'meeting_ended',
    });
    expect(f.persistedRuns.map((run) => run.status)).toEqual([
      'waiting_room',
      'reconnecting',
      'joining',
      'connected',
      'leaving',
      'completed',
    ]);
    expect(f.port.reconnect).toHaveBeenCalledOnce();
  });

  it('completes a connected run when BBB reports meeting_ended', async () => {
    const startingRun: Run = {
      jobId: 'lecture',
      occurrenceId: 'lecture:2026-09-29T10:00:00Z',
      status: 'joining',
      createdAt: '2026-09-29T10:00:00Z',
      updatedAt: '2026-09-29T10:00:00Z',
    };
    const occurrence: Occurrence = {
      id: startingRun.occurrenceId,
      jobId: startingRun.jobId,
      joinAt: '2026-09-29T10:00:00Z',
      leaveAt: '2026-09-29T11:35:00Z',
      timezone: 'UTC',
    };
    const session: BbbSession = {
      page: {},
      status: 'starting',
      url: 'https://bbb.example.test/lecture',
      startedAt: new Date('2026-09-29T10:00:00Z'),
    };
    const signal = new AbortController().signal;
    const persistedRuns: Run[] = [];
    const events: string[] = [];
    const port: BbbSessionPort = {
      join: vi.fn(async (): Promise<BbbObservation> => {
        events.push('join');
        return { kind: 'connected' };
      }),
      observe: vi.fn(async (): Promise<BbbObservation> => {
        events.push('observe');
        return { kind: 'meeting_ended' };
      }),
      reconnect: vi.fn(async (): Promise<BbbObservation> => {
        throw new Error('Normal meeting end must not reconnect');
      }),
      leave: vi.fn(async () => {
        events.push('leave');
        session.status = 'left';
      }),
    };
    const controller = new LectureSessionController({
      now: () => new Date('2026-09-29T11:00:00Z'),
      sleep: async () => {
        throw new Error('Normal meeting end must not sleep');
      },
      update: async (run) => {
        persistedRuns.push(run);
        events.push(run.status);
        return run;
      },
    });

    const result = await controller.run(
      startingRun,
      occurrence,
      session,
      port,
      signal,
    );

    expect(result).toEqual({
      ...startingRun,
      status: 'completed',
      completionReason: 'meeting_ended',
      updatedAt: '2026-09-29T11:00:00.000Z',
    });
    expect(persistedRuns.map((run) => run.status)).toEqual([
      'connected',
      'leaving',
      'completed',
    ]);
    expect(events).toEqual([
      'join',
      'connected',
      'observe',
      'leaving',
      'leave',
      'completed',
    ]);
    expect(port.join).toHaveBeenCalledWith(session, expect.any(AbortSignal));
    expect(port.observe).toHaveBeenCalledWith(session, expect.any(AbortSignal));
    expect(port.leave).toHaveBeenCalledExactlyOnceWith(session);
    expect(session.status).toBe('left');
  });
});
