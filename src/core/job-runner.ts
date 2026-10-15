import { LectureSessionController } from './lecture-session-controller.js';
import { completeRun, transitionRun } from './lifecycle.js';
import { findActiveOccurrence } from './occurrence.js';
import { redactSensitiveText } from './redaction.js';
import type {
  Run,
  RunStatus,
  CompletionReason,
  JobRepository,
  RunRepository,
  BbbSessionPort,
  BbbObservation,
} from './types.js';
import type { SdoMcpClient } from './mcp-client.js';
import type { PlaywrightBbbSessionManager } from './bbb-session.js';

function sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

function interruptible<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }
    operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

export interface RunResult {
  jobId: string;
  occurrenceId: string;
  status: RunStatus;
  completionReason?: CompletionReason;
  bbbUrl?: string;
  error?: string;
  authRequired?: true;
  durationSeconds: number;
}

export class JobRunner {
  constructor(
    private mcpClient: SdoMcpClient,
    private bbbManager: PlaywrightBbbSessionManager,
    private jobRepo: JobRepository,
    private runRepo: RunRepository,
  ) {}

  async runJob(
    jobId: string,
    occurrenceId: string,
    signal: AbortSignal = new AbortController().signal,
  ): Promise<RunResult> {
    const startTime = Date.now();
    const result: RunResult = {
      jobId,
      occurrenceId,
      status: 'scheduled',
      durationSeconds: 0,
    };
    let run: Run | undefined;
    let owned = false;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    const preflight = new AbortController();
    let leaveAt = Number.POSITIVE_INFINITY;
    const stopReason = (): 'manual' | 'deadline' | undefined => {
      if (signal.aborted) return 'manual';
      if (Date.now() >= leaveAt) return 'deadline';
      return undefined;
    };
    const update = async (next: Run): Promise<Run> => {
      await this.runRepo.update(next);
      run = next;
      return next;
    };
    try {
      const claimed = await this.runRepo.getOrCreate({
        jobId,
        occurrenceId,
        status: 'scheduled',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      run = claimed.run;
      if (run.status !== 'scheduled') {
        return {
          ...result,
          status: run.status,
          completionReason: run.completionReason,
        };
      }
      const job = await this.jobRepo.getById(jobId);
      if (!job) throw new Error('Job not found: ' + jobId);
      const occurrence = findActiveOccurrence(job, new Date());
      if (!occurrence || occurrence.id !== occurrenceId) {
        const skipped = await this.runRepo.skipScheduled(
          jobId,
          occurrenceId,
          new Date().toISOString(),
        );
        run = skipped ?? (await this.runRepo.getOrCreate(run)).run;
      } else {
        const activeRun = await this.runRepo.claimScheduled(
          jobId,
          occurrenceId,
          new Date().toISOString(),
        );
        if (!activeRun) {
          const current = await this.runRepo.getOrCreate(run);
          return {
            ...result,
            status: current.run.status,
            completionReason: current.run.completionReason,
          };
        }
        run = activeRun;
        owned = true;
        leaveAt = Date.parse(occurrence.leaveAt);
        onAbort = () => preflight.abort();
        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted) onAbort();
        deadlineTimer = setTimeout(
          () => preflight.abort(),
          Math.max(0, leaveAt - Date.now()),
        );
        const finishWithoutSession = async (reason: 'manual' | 'deadline') => {
          await update(
            transitionRun(run!, 'leaving', new Date().toISOString()),
          );
          await update(completeRun(run!, reason, new Date().toISOString()));
        };
        const stoppedBeforeResolution = stopReason();
        if (stoppedBeforeResolution) {
          await finishWithoutSession(stoppedBeforeResolution);
          result.durationSeconds = (Date.now() - startTime) / 1000;
          return {
            ...result,
            status: run!.status,
            completionReason: run!.completionReason,
          };
        }
        let bbbUrl: string;
        if (job.target.type === 'direct') {
          bbbUrl = job.target.activityUrl;
        } else {
          try {
            const resolution = await interruptible(
              this.mcpClient.resolveOnlineLecture({
                ...(job.target.courseId
                  ? {
                      courseUrl: `https://sdo.tusur.ru/course/view.php?id=${encodeURIComponent(job.target.courseId)}`,
                    }
                  : { courseQuery: job.target.courseName || '' }),
                ...(job.target.lectureQuery
                  ? { lectureQuery: job.target.lectureQuery }
                  : {}),
              }),
              preflight.signal,
            );
            if (resolution.status === 'resolved') {
              bbbUrl = resolution.module.activityUrl;
            } else if (resolution.status === 'auth_required') {
              result.authRequired = true;
              throw new Error('SDO authentication required');
            } else if (resolution.status === 'not_found') {
              throw new Error('Online lecture not found');
            } else {
              throw new Error('Online lecture match is ambiguous');
            }
          } finally {
            await this.mcpClient.close();
          }
        }
        const stoppedAfterResolution = stopReason();
        if (stoppedAfterResolution) {
          await finishWithoutSession(stoppedAfterResolution);
          result.durationSeconds = (Date.now() - startTime) / 1000;
          return {
            ...result,
            status: run!.status,
            completionReason: run!.completionReason,
          };
        }
        result.bbbUrl = redactSensitiveText(bbbUrl);
        await update(transitionRun(run!, 'joining', new Date().toISOString()));
        const stoppedBeforeStart = stopReason();
        if (stoppedBeforeStart) {
          await finishWithoutSession(stoppedBeforeStart);
          result.durationSeconds = (Date.now() - startTime) / 1000;
          return {
            ...result,
            status: run!.status,
            completionReason: run!.completionReason,
          };
        }
        const session = await this.bbbManager.startSession(
          bbbUrl,
          {
            headless: job.browser.headless,
            timeout: 30000,
            joinTimeout: 10000,
          },
          preflight.signal,
        );
        const stoppedAfterStart = stopReason();
        if (stoppedAfterStart) {
          try {
            await this.bbbManager.leaveSession(session);
          } finally {
            await finishWithoutSession(stoppedAfterStart);
          }
          result.durationSeconds = (Date.now() - startTime) / 1000;
          return {
            ...result,
            status: run!.status,
            completionReason: run!.completionReason,
          };
        }
        const observe = async (
          activeSignal: AbortSignal,
        ): Promise<BbbObservation> => {
          try {
            return await this.bbbManager.observe(session, activeSignal);
          } catch (error) {
            if (!activeSignal.aborted) {
              result.error = redactSensitiveText(
                error instanceof Error ? error.message : String(error),
              );
            }
            throw error;
          }
        };
        const join = async (
          activeSignal: AbortSignal,
        ): Promise<BbbObservation> => {
          activeSignal.throwIfAborted();
          try {
            await this.bbbManager.joinAsListener(session);
          } catch (error) {
            activeSignal.throwIfAborted();
            if (
              error instanceof Error &&
              error.name === 'UnsupportedBbbObservationError'
            )
              throw error;
            return {
              kind: 'network_error',
              message: redactSensitiveText(
                error instanceof Error ? error.message : String(error),
              ),
            };
          }
          return observe(activeSignal);
        };
        const port: BbbSessionPort = {
          join: (_session, activeSignal) => join(activeSignal),
          observe: async (_session, activeSignal) => {
            await sleep(1000, activeSignal);
            return observe(activeSignal);
          },
          reconnect: async (activeSession, activeSignal) => {
            try {
              return await this.bbbManager.reconnect(
                activeSession,
                activeSignal,
              );
            } catch (error) {
              if (!activeSignal.aborted) {
                result.error = redactSensitiveText(
                  error instanceof Error ? error.message : String(error),
                );
              }
              throw error;
            }
          },
          leave: (activeSession) => this.bbbManager.leaveSession(activeSession),
        };
        run = await new LectureSessionController({
          now: () => new Date(),
          sleep,
          update,
        }).run(run!, occurrence, session, port, signal);
      }
    } catch (error) {
      result.error = redactSensitiveText(
        error instanceof Error ? error.message : String(error),
      );
      if (owned && run && ['resolving', 'joining'].includes(run.status)) {
        const stopped = stopReason();
        if (stopped) {
          await update(transitionRun(run, 'leaving', new Date().toISOString()));
          await update(completeRun(run!, stopped, new Date().toISOString()));
        } else {
          await update({
            ...transitionRun(run, 'failed', new Date().toISOString()),
            completionReason: 'error',
          });
        }
      }
      if (!owned || run?.status !== 'completed') {
        result.status = 'failed';
        result.completionReason = 'error';
      }
    } finally {
      if (deadlineTimer) clearTimeout(deadlineTimer);
      if (onAbort) signal.removeEventListener('abort', onAbort);
    }
    if (run && (owned || result.status !== 'failed')) {
      result.status = run.status;
      result.completionReason = run.completionReason;
    }
    result.durationSeconds = (Date.now() - startTime) / 1000;
    return result;
  }
}
