import { describe, expect, it } from 'vitest';

import { leaveIfDeadlineReached } from '../../src/core/deadline.js';
import type { Run } from '../../src/core/types.js';

const baseRun: Omit<Run, 'status'> = {
  jobId: 'math-monday',
  occurrenceId: 'math-monday:2026-09-28T10:00:00.000+07:00',
  createdAt: '2026-09-28T10:00:00.000+07:00',
  updatedAt: '2026-09-28T10:00:00.000+07:00',
};

describe('leaveIfDeadlineReached', () => {
  it.each(['waiting_room', 'connected'] as const)(
    'moves %s to leaving at the hard deadline',
    (status) => {
      expect(
        leaveIfDeadlineReached(
          { ...baseRun, status },
          '2026-09-28T11:35:00.000+07:00',
          '2026-09-28T11:35:00.000+07:00',
        ),
      ).toMatchObject({
        status: 'leaving',
        updatedAt: '2026-09-28T11:35:00.000+07:00',
      });
    },
  );

  it('keeps an active run unchanged before its deadline', () => {
    const run = { ...baseRun, status: 'connected' as const };

    expect(
      leaveIfDeadlineReached(
        run,
        '2026-09-28T11:34:59.999+07:00',
        '2026-09-28T11:35:00.000+07:00',
      ),
    ).toBe(run);
  });
});
