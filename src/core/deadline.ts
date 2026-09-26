import { transitionRun } from './lifecycle.js';
import type { Run } from './types.js';

const terminalStatuses = new Set(['completed', 'skipped', 'blocked', 'failed']);

export function leaveIfDeadlineReached(
  run: Run,
  now: string,
  leaveAt: string,
): Run {
  if (
    terminalStatuses.has(run.status) ||
    Date.parse(now) < Date.parse(leaveAt)
  ) {
    return run;
  }

  return transitionRun(run, 'leaving', now);
}
