import { describe, expect, it, vi } from 'vitest';
import { createFakeClock } from '../../src/worker/fake-clock.js';

describe('fake session clock', () => {
  it('anchors startup after 22:30 to noon on the same Krasnoyarsk date', () => {
    const clock = createFakeClock(
      () => new Date('2026-10-18T15:45:00.000Z'), // 22:45 in Krasnoyarsk
    );

    expect(clock().toISOString()).toBe('2026-10-18T05:00:00.000Z');
  });

  it('keeps the startup date when wall time crosses Krasnoyarsk midnight', () => {
    let wallTime = Date.parse('2026-10-18T16:59:59.500Z');
    const clock = createFakeClock(() => new Date(wallTime));

    expect(clock().toISOString()).toBe('2026-10-18T05:00:00.000Z');
    wallTime += 1_000;
    expect(clock().toISOString()).toBe('2026-10-18T05:00:01.000Z');
  });

  it('advances by elapsed wall-clock milliseconds from one captured baseline', () => {
    let wallTime = Date.parse('2026-10-18T05:00:00.000Z');
    const source = vi.fn(() => new Date(wallTime));
    const clock = createFakeClock(source);

    expect(source).toHaveBeenCalledTimes(1);
    const initialTime = clock();
    expect(source).toHaveBeenCalledTimes(2);

    wallTime += 12_345;
    expect(clock().getTime()).toBe(initialTime.getTime() + 12_345);
    expect(source).toHaveBeenCalledTimes(3);
  });

  it('derives the startup date in Krasnoyarsk rather than the machine timezone', () => {
    vi.stubEnv('TZ', 'UTC');
    try {
      const clock = createFakeClock(
        () => new Date('2026-10-18T17:00:00.000Z'), // Oct 19 in Krasnoyarsk
      );

      expect(clock().toISOString()).toBe('2026-10-19T05:00:00.000Z');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
