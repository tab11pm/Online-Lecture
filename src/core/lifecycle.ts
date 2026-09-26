import type { CompletionReason, Run, RunStatus } from './types.js';

const allowedTransitions: Record<RunStatus, readonly RunStatus[]> = {
  scheduled: ['resolving', 'skipped', 'leaving'],
  resolving: ['joining', 'blocked', 'failed', 'leaving'],
  joining: ['waiting_room', 'connected', 'blocked', 'failed', 'leaving'],
  waiting_room: ['connected', 'blocked', 'failed', 'leaving'],
  connected: ['reconnecting', 'leaving'],
  reconnecting: ['joining', 'failed', 'leaving'],
  leaving: ['completed'],
  completed: [],
  skipped: [],
  blocked: [],
  failed: [],
};

export function transitionRun(
  run: Run,
  status: RunStatus,
  updatedAt: string,
): Run {
  if (!allowedTransitions[run.status].includes(status)) {
    throw new Error(`Cannot transition run from ${run.status} to ${status}`);
  }

  return { ...run, status, updatedAt };
}

export function completeRun(
  run: Run,
  reason: CompletionReason,
  completedAt: string,
): Run {
  return {
    ...transitionRun(run, 'completed', completedAt),
    completionReason: reason,
  };
}
