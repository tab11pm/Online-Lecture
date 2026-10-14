import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SchedulerLoop } from '../../src/worker/scheduler-loop.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const now = () => new Date('2026-10-15T08:00:00.000Z');

describe('SchedulerLoop', () => {
  it('ticks immediately and every 30 seconds', async () => {
    const check = vi.fn(async () => undefined);
    const loop = new SchedulerLoop({ check, now, onError: vi.fn() });
    loop.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(check).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(check).toHaveBeenCalledTimes(3);
    loop.stop();
  });

  it('does not overlap ticks', async () => {
    let release!: () => void;
    const check = vi.fn(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    const loop = new SchedulerLoop({ check, now, onError: vi.fn() });
    const first = loop.tick();
    const second = loop.tick();
    expect(check).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('stop cancels further ticks', async () => {
    const check = vi.fn(async () => undefined);
    const loop = new SchedulerLoop({ check, now, onError: vi.fn() });
    loop.start();
    await vi.advanceTimersByTimeAsync(0);
    loop.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('reports check errors without stopping', async () => {
    const error = new Error('db');
    const check = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue(undefined);
    const onError = vi.fn();
    const loop = new SchedulerLoop({ check, now, onError });
    loop.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledWith(error);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(check).toHaveBeenCalledTimes(2);
    loop.stop();
  });
});
