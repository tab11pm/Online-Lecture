import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TimetableImportResult } from '@core/timetable/import-service.js';
import type { ImportView } from '../../src/shared/lectures.js';
import {
  DAY_MS,
  ImportScheduler,
  RETRY_MS,
} from '../../src/worker/import-scheduler.js';

beforeEach(() => vi.useFakeTimers({ now: new Date('2026-10-15T08:00:00Z') }));
afterEach(() => vi.useRealTimers());

const completed = (
  over: Partial<Extract<TimetableImportResult, { status: 'completed' }>> = {},
): TimetableImportResult => ({
  status: 'completed',
  faculty: 'fb',
  group: '123',
  lessons: 3,
  complete: true,
  summary: { added: 2, removed: 1 } as never,
  unresolved: [],
  ambiguous: [],
  unmapped: [],
  ...over,
});

function setup(
  options: {
    results?: Array<TimetableImportResult | Error>;
    lastSuccess?: Date;
    active?: boolean;
  } = {},
) {
  const results = [...(options.results ?? [completed()])];
  const state = { active: options.active ?? false, last: options.lastSuccess };
  const views: ImportView[] = [];
  const runImport = vi.fn(async (onProgress: (s: never) => void) => {
    onProgress('group' as never);
    const next = results.length > 1 ? results.shift()! : results[0]!;
    if (next instanceof Error) throw next;
    return next;
  });
  const onAuthRequired = vi.fn();
  const onFailure = vi.fn();
  const scheduler = new ImportScheduler({
    runImport: runImport as never,
    isLectureActive: () => state.active,
    lastSuccessAt: () => state.last,
    now: () => new Date(),
    onView: (v) => views.push(v),
    onAuthRequired,
    onFailure,
  });
  return { scheduler, runImport, views, state, onAuthRequired, onFailure };
}

describe('ImportScheduler', () => {
  it('imports after login', async () => {
    const { scheduler, runImport } = setup();
    scheduler.start('login');
    await vi.advanceTimersByTimeAsync(0);
    expect(runImport).toHaveBeenCalledTimes(1);
    expect(scheduler.view.status).toBe('done');
    scheduler.stop();
  });

  it('skips startup import when the last success is recent', async () => {
    const { scheduler, runImport } = setup({
      lastSuccess: new Date(Date.now() - 3_600_000),
    });
    scheduler.start('startup');
    await vi.advanceTimersByTimeAsync(0);
    expect(runImport).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it('imports on startup after 24 hours', async () => {
    const { scheduler, runImport } = setup({
      lastSuccess: new Date(Date.now() - DAY_MS - 1),
    });
    scheduler.start('startup');
    await vi.advanceTimersByTimeAsync(0);
    expect(runImport).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('imports on startup when there was no success', async () => {
    const { scheduler, runImport } = setup();
    scheduler.start('startup');
    await vi.advanceTimersByTimeAsync(0);
    expect(runImport).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('schedules the next import a day after success', async () => {
    const { scheduler, runImport } = setup();
    scheduler.start('login');
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(DAY_MS - 1);
    expect(runImport).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(runImport).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('retries a failed import after one hour, not sooner', async () => {
    const { scheduler, runImport, onFailure } = setup({
      results: [{ status: 'failed', message: 'boom' }, completed()],
    });
    scheduler.start('login');
    await vi.advanceTimersByTimeAsync(0);
    expect(scheduler.view).toMatchObject({ status: 'failed', message: 'boom' });
    expect(onFailure).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(RETRY_MS - 1);
    expect(runImport).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(runImport).toHaveBeenCalledTimes(2);
    expect(scheduler.view.status).toBe('done');
    expect(onFailure).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('treats a thrown import as a failure with a retry', async () => {
    const { scheduler, runImport } = setup({
      results: [new Error('secret'), completed()],
    });
    scheduler.start('login');
    await vi.advanceTimersByTimeAsync(0);
    expect(scheduler.view).toMatchObject({
      status: 'failed',
      message: 'Не удалось обновить расписание.',
    });
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    expect(runImport).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('defers automatic imports during a lecture until it finishes', async () => {
    const { scheduler, runImport, state } = setup({ active: true });
    scheduler.start('login');
    await vi.advanceTimersByTimeAsync(0);
    expect(runImport).not.toHaveBeenCalled();
    state.active = false;
    scheduler.lectureFinished();
    await vi.advanceTimersByTimeAsync(0);
    expect(runImport).toHaveBeenCalledTimes(1);
    scheduler.lectureFinished();
    await vi.advanceTimersByTimeAsync(0);
    expect(runImport).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('runs a manual import during a lecture', async () => {
    const { scheduler, runImport } = setup({ active: true });
    await scheduler.request('manual');
    expect(runImport).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('shares one run between concurrent requests', async () => {
    const { scheduler, runImport } = setup();
    const a = scheduler.request('manual');
    const b = scheduler.request('manual');
    await Promise.all([a, b]);
    expect(runImport).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('reports stages through the view', async () => {
    const { scheduler, views } = setup();
    await scheduler.request('manual');
    expect(views[0]).toEqual({ status: 'running', stage: 'group' });
    expect(views.at(-1)).toMatchObject({
      status: 'done',
      summary: { added: 2, removed: 1, complete: true },
      unresolved: [],
    });
    scheduler.stop();
  });

  it('merges unresolved, ambiguous and unmapped names without duplicates', async () => {
    const { scheduler } = setup({
      results: [
        completed({
          unresolved: ['A', 'B'],
          ambiguous: ['B', 'C'],
          unmapped: ['A', 'D'],
        }),
      ],
    });
    await scheduler.request('manual');
    expect(scheduler.view).toMatchObject({ unresolved: ['A', 'B', 'C', 'D'] });
    scheduler.stop();
  });

  it('calls onAuthRequired without retrying', async () => {
    const { scheduler, runImport, onAuthRequired } = setup({
      results: [{ status: 'auth_required' }],
    });
    await scheduler.request('manual');
    expect(onAuthRequired).toHaveBeenCalledTimes(1);
    expect(scheduler.view).toMatchObject({
      status: 'failed',
      message: 'Сессия ТУСУР истекла. Войдите снова.',
    });
    await vi.advanceTimersByTimeAsync(DAY_MS * 2);
    expect(runImport).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('stop clears pending timers', async () => {
    const { scheduler, runImport } = setup();
    await scheduler.request('manual');
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(DAY_MS * 2);
    expect(runImport).toHaveBeenCalledTimes(1);
  });
});
