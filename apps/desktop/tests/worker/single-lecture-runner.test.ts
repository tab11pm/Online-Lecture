import { describe, it, expect, vi } from 'vitest';
import type { Occurrence } from '@core/core/types.js';
import type { RunResult } from '@core/core/job-runner.js';
import { SingleLectureRunner } from '../../src/worker/single-lecture-runner.js';

function occ(id: string): Occurrence {
  return {
    id,
    jobId: `job-${id}`,
    joinAt: '2026-10-15T08:00:00.000Z',
    leaveAt: '2026-10-15T09:30:00.000Z',
    timezone: 'Asia/Tomsk',
  };
}

function result(o: string, extra: Partial<RunResult> = {}): RunResult {
  return {
    jobId: `job-${o}`,
    occurrenceId: o,
    status: 'completed',
    durationSeconds: 1,
    ...extra,
  } as RunResult;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('SingleLectureRunner', () => {
  it('reports a crashed run through onError and keeps going', async () => {
    const error = new Error('boom');
    const onError = vi.fn();
    const runner = new SingleLectureRunner({
      runJob: vi.fn(() => Promise.reject(error)),
      onChange: vi.fn(),
      onAuthRequired: vi.fn(),
      onError,
    });
    await runner.start(occ('a'));
    expect(await runner.whenIdle(1000)).toBe(true);
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('runs one occurrence at a time and queues the next', async () => {
    const gates = new Map<string, ReturnType<typeof deferred<RunResult>>>();
    const runJob = vi.fn((_j: string, o: string) => {
      const d = deferred<RunResult>();
      gates.set(o, d);
      return d.promise;
    });
    const runner = new SingleLectureRunner({
      runJob,
      onChange: vi.fn(),
      onAuthRequired: vi.fn(),
    });
    await runner.start(occ('a'));
    await runner.start(occ('b'));
    expect(runJob).toHaveBeenCalledTimes(1);
    expect(runner.active?.id).toBe('a');
  });

  it('starts the queued occurrence after the active one ends', async () => {
    const gates = new Map<string, ReturnType<typeof deferred<RunResult>>>();
    const runJob = vi.fn((_j: string, o: string) => {
      const d = deferred<RunResult>();
      gates.set(o, d);
      return d.promise;
    });
    const onChange = vi.fn();
    const runner = new SingleLectureRunner({
      runJob,
      onChange,
      onAuthRequired: vi.fn(),
    });
    await runner.start(occ('a'));
    await runner.start(occ('b'));
    gates.get('a')!.resolve(result('a'));
    await vi.waitFor(() => expect(runner.active?.id).toBe('b'));
    expect(runJob).toHaveBeenCalledTimes(2);
    expect(runJob.mock.calls[1]![0]).toBe('job-b');
    gates.get('b')!.resolve(result('b'));
    expect(await runner.whenIdle(500)).toBe(true);
    expect(runner.active).toBeUndefined();
    expect(onChange).toHaveBeenCalled();
  });

  it('stopCurrent aborts the active run and waits for it', async () => {
    let signal!: AbortSignal;
    const runJob = vi.fn(
      (_j: string, o: string, s: AbortSignal) =>
        new Promise<RunResult>((resolve) => {
          signal = s;
          s.addEventListener('abort', () => resolve(result(o)));
        }),
    );
    const runner = new SingleLectureRunner({
      runJob,
      onChange: vi.fn(),
      onAuthRequired: vi.fn(),
    });
    await runner.start(occ('a'));
    await runner.stopCurrent();
    expect(signal.aborted).toBe(true);
    expect(runner.active).toBeUndefined();
  });

  it('whenIdle times out while a run ignores the abort', async () => {
    const runJob = vi.fn(() => new Promise<RunResult>(() => {}));
    const runner = new SingleLectureRunner({
      runJob,
      onChange: vi.fn(),
      onAuthRequired: vi.fn(),
    });
    await runner.start(occ('a'));
    expect(await runner.whenIdle(20)).toBe(false);
  });

  it('reports authRequired results', async () => {
    const onAuthRequired = vi.fn();
    const runner = new SingleLectureRunner({
      runJob: async (_j, o) => result(o, { authRequired: true }),
      onChange: vi.fn(),
      onAuthRequired,
    });
    await runner.start(occ('a'));
    await runner.whenIdle(500);
    expect(onAuthRequired).toHaveBeenCalledTimes(1);
  });

  it('does not queue the same occurrence twice', async () => {
    const gate = deferred<RunResult>();
    const runJob = vi.fn(() => gate.promise);
    const runner = new SingleLectureRunner({
      runJob,
      onChange: vi.fn(),
      onAuthRequired: vi.fn(),
    });
    await runner.start(occ('a'));
    await runner.start(occ('a'));
    await runner.start(occ('b'));
    await runner.start(occ('b'));
    gate.resolve(result('a'));
    expect(await runner.whenIdle(500)).toBe(true);
    expect(runJob).toHaveBeenCalledTimes(2);
  });

  it('survives a rejected run and continues with the queue', async () => {
    const runJob = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(result('b'));
    const runner = new SingleLectureRunner({
      runJob,
      onChange: vi.fn(),
      onAuthRequired: vi.fn(),
    });
    await runner.start(occ('a'));
    await runner.start(occ('b'));
    expect(await runner.whenIdle(500)).toBe(true);
    expect(runJob).toHaveBeenCalledTimes(2);
  });

  it('stopCurrent keeps queued occurrences and starts the next one', async () => {
    const aborted: string[] = [];
    const runJob = vi.fn(
      (_j: string, o: string, s: AbortSignal) =>
        new Promise<RunResult>((resolve) => {
          s.addEventListener('abort', () => {
            aborted.push(o);
            resolve(result(o));
          });
          if (o === 'b') resolve(result(o));
        }),
    );
    const runner = new SingleLectureRunner({
      runJob,
      onChange: vi.fn(),
      onAuthRequired: vi.fn(),
    });
    await runner.start(occ('a'));
    await runner.start(occ('b'));
    await runner.stopCurrent();
    expect(aborted).toEqual(['a']);
    expect(await runner.whenIdle(500)).toBe(true);
    expect(runJob).toHaveBeenCalledTimes(2);
    expect(runJob.mock.calls[1]![1]).toBe('b');
  });

  it('close drops the queue and ignores later starts', async () => {
    const gate = deferred<RunResult>();
    const runJob = vi.fn(() => gate.promise);
    const runner = new SingleLectureRunner({
      runJob,
      onChange: vi.fn(),
      onAuthRequired: vi.fn(),
    });
    await runner.start(occ('a'));
    await runner.start(occ('b'));
    runner.close();
    expect(runner.active?.id).toBe('a');
    gate.resolve(result('a'));
    expect(await runner.whenIdle(500)).toBe(true);
    await runner.start(occ('c'));
    expect(runJob).toHaveBeenCalledTimes(1);
    expect(runner.active).toBeUndefined();
  });

  it('stop removes a queued occurrence so it never launches', async () => {
    const gate = deferred<RunResult>();
    const runJob = vi.fn(() => gate.promise);
    const runner = new SingleLectureRunner({
      runJob,
      onChange: vi.fn(),
      onAuthRequired: vi.fn(),
    });
    await runner.start(occ('a'));
    await runner.start(occ('b'));
    await runner.stop(occ('b'), 'manual');
    expect(runner.active?.id).toBe('a');
    gate.resolve(result('a'));
    expect(await runner.whenIdle(500)).toBe(true);
    expect(runJob).toHaveBeenCalledTimes(1);
  });
});
