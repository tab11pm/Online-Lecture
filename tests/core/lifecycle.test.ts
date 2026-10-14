import { describe, expect, it } from 'vitest';

import { completeRun, transitionRun } from '../../src/core/lifecycle.js';
import type { Run } from '../../src/core/types.js';

const scheduledRun: Run = {
  jobId: 'math-monday',
  occurrenceId: 'math-monday:2026-09-28T10:00:00.000+07:00',
  status: 'scheduled',
  createdAt: '2026-09-28T10:00:00.000+07:00',
  updatedAt: '2026-09-28T10:00:00.000+07:00',
};

describe('run lifecycle', () => {
  it.each(['joining', 'waiting_room'] as const)(
    'allows a technical failure while %s to reconnect',
    (status) => {
      const reconnecting = transitionRun(
        { ...scheduledRun, status },
        'reconnecting',
        '2026-09-28T10:00:01Z',
      );
      expect(
        transitionRun(reconnecting, 'joining', '2026-09-28T10:00:06Z'),
      ).toMatchObject({ status: 'joining' });
    },
  );

  it.each(['blocked', 'failed'] as const)(
    'allows cleanup to finish as %s',
    (status) => {
      expect(
        transitionRun(
          { ...scheduledRun, status: 'leaving' },
          status,
          '2026-09-28T10:00:01Z',
        ),
      ).toMatchObject({ status });
    },
  );

  it('allows a connected lecture to leave and complete with a reason', () => {
    const resolving = transitionRun(
      scheduledRun,
      'resolving',
      '2026-09-28T10:00:01Z',
    );
    const joining = transitionRun(resolving, 'joining', '2026-09-28T10:00:02Z');
    const connected = transitionRun(
      joining,
      'connected',
      '2026-09-28T10:00:03Z',
    );
    const leaving = transitionRun(connected, 'leaving', '2026-09-28T11:34:59Z');

    expect(
      completeRun(leaving, 'deadline', '2026-09-28T11:35:00Z'),
    ).toMatchObject({
      status: 'completed',
      completionReason: 'deadline',
      updatedAt: '2026-09-28T11:35:00Z',
    });
  });

  it('rejects a transition that skips the lifecycle', () => {
    expect(() =>
      transitionRun(scheduledRun, 'connected', '2026-09-28T10:00:01Z'),
    ).toThrow('Cannot transition run from scheduled to connected');
  });
});
