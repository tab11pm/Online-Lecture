import { completeRun, transitionRun } from './lifecycle.js';
import { nextRetryDelay } from './retry.js';
import type {
  BbbObservation,
  BbbSession,
  BbbSessionPort,
  CompletionReason,
  LectureSessionControllerDependencies,
  Occurrence,
  Run,
  RunStatus,
} from './types.js';

export class LectureSessionController {
  constructor(
    private readonly dependencies: LectureSessionControllerDependencies,
  ) {}

  async run(
    startingRun: Run,
    occurrence: Occurrence,
    session: BbbSession,
    port: BbbSessionPort,
    signal: AbortSignal,
  ): Promise<Run> {
    let run = startingRun;
    let reason: CompletionReason | 'blocked' = 'meeting_ended';
    let retries = 0;
    const leaveAt = Date.parse(occurrence.leaveAt);
    const deadlineController = new AbortController();
    const combinedController = new AbortController();
    const combinedSignal = combinedController.signal;
    const interrupt = () => combinedController.abort();
    signal.addEventListener('abort', interrupt, { once: true });
    deadlineController.signal.addEventListener('abort', interrupt, {
      once: true,
    });
    if (signal.aborted) interrupt();
    const deadlineTimer = setTimeout(
      () => deadlineController.abort(),
      Math.max(0, leaveAt - this.dependencies.now().getTime()),
    );
    const stopReason = (): 'manual' | 'deadline' | undefined => {
      if (signal.aborted) return 'manual';
      if (
        deadlineController.signal.aborted ||
        this.dependencies.now().getTime() >= leaveAt
      )
        return 'deadline';
      return undefined;
    };
    // Interrupt our wait even when a port does not settle after its signal aborts.
    const interruptible = <T>(operation: () => Promise<T>): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        const cleanup = () =>
          combinedSignal.removeEventListener('abort', onAbort);
        const onAbort = () => {
          cleanup();
          reject(new Error('Lecture session interrupted'));
        };
        if (combinedSignal.aborted) {
          onAbort();
          return;
        }
        combinedSignal.addEventListener('abort', onAbort, { once: true });
        Promise.resolve()
          .then(() => {
            if (combinedSignal.aborted) {
              throw new Error('Lecture session interrupted');
            }
            return operation();
          })
          .then(
            (value) => {
              cleanup();
              resolve(value);
            },
            (error: unknown) => {
              cleanup();
              reject(error);
            },
          );
      });
    const transition = async (status: RunStatus): Promise<void> => {
      run = await this.dependencies.update(
        transitionRun(run, status, this.dependencies.now().toISOString()),
      );
    };

    try {
      let observation: BbbObservation | undefined;
      while (true) {
        const stopped = stopReason();
        if (stopped) {
          reason = stopped;
          break;
        }

        if (!observation) {
          observation = await interruptible(() =>
            port.join(session, combinedSignal),
          );
          continue;
        }

        if (observation.kind === 'meeting_ended') break;
        if (observation.kind === 'moderator_removed') {
          reason = 'blocked';
          break;
        }
        if (observation.kind === 'network_error') {
          const delay = nextRetryDelay(retries);
          if (delay === undefined) {
            reason = 'error';
            break;
          }
          await transition('reconnecting');
          const beforeSleep = stopReason();
          if (beforeSleep) {
            reason = beforeSleep;
            break;
          }
          await interruptible(() =>
            this.dependencies.sleep(
              Math.min(delay, leaveAt - this.dependencies.now().getTime()),
              combinedSignal,
            ),
          );
          const afterSleep = stopReason();
          if (afterSleep) {
            reason = afterSleep;
            break;
          }
          await transition('joining');
          const beforeReconnect = stopReason();
          if (beforeReconnect) {
            reason = beforeReconnect;
            break;
          }
          retries += 1;
          observation = await interruptible(() =>
            port.reconnect(session, combinedSignal),
          );
          continue;
        }

        if (run.status !== observation.kind) {
          await transition(observation.kind);
        }
        const beforeObserve = stopReason();
        if (beforeObserve) {
          reason = beforeObserve;
          break;
        }
        observation = await interruptible(() =>
          port.observe(session, combinedSignal),
        );
      }
    } catch {
      reason = stopReason() ?? 'error';
    } finally {
      clearTimeout(deadlineTimer);
      signal.removeEventListener('abort', interrupt);
      deadlineController.signal.removeEventListener('abort', interrupt);
    }

    try {
      await transition('leaving');
    } finally {
      try {
        await port.leave(session);
      } catch {
        if (reason !== 'blocked') reason = 'error';
      }
    }

    const completedAt = this.dependencies.now().toISOString();
    if (reason === 'blocked') {
      return this.dependencies.update(
        transitionRun(run, 'blocked', completedAt),
      );
    }
    if (reason === 'error') {
      return this.dependencies.update({
        ...transitionRun(run, 'failed', completedAt),
        completionReason: 'error',
      });
    }
    return this.dependencies.update(completeRun(run, reason, completedAt));
  }
}
