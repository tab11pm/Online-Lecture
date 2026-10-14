import type { RunResult } from '@core/core/job-runner.js';
import type {
  CompletionReason,
  LectureRunner,
  Occurrence,
} from '@core/core/types.js';

export type RunJobFn = (
  jobId: string,
  occurrenceId: string,
  signal: AbortSignal,
) => Promise<RunResult>;

export interface SingleLectureRunnerDependencies {
  runJob: RunJobFn;
  onChange(): void;
  onAuthRequired(): void;
}

/** Runs at most one lecture at a time; further occurrences wait in a FIFO queue. */
export class SingleLectureRunner implements LectureRunner {
  private current:
    | {
        occurrence: Occurrence;
        controller: AbortController;
        done: Promise<void>;
      }
    | undefined;
  private readonly queue: Occurrence[] = [];
  private state: 'open' | 'closed' = 'open';

  constructor(private readonly deps: SingleLectureRunnerDependencies) {}

  get active(): Occurrence | undefined {
    return this.current?.occurrence;
  }

  async start(occurrence: Occurrence): Promise<void> {
    if (this.state === 'closed') return;
    if (
      this.current?.occurrence.id === occurrence.id ||
      this.queue.some((queued) => queued.id === occurrence.id)
    ) {
      return;
    }
    if (this.current) {
      this.queue.push(occurrence);
      return;
    }
    this.launch(occurrence);
  }

  async stop(occurrence: Occurrence, _reason: CompletionReason): Promise<void> {
    const queuedIndex = this.queue.findIndex(
      (queued) => queued.id === occurrence.id,
    );
    if (queuedIndex >= 0) {
      this.queue.splice(queuedIndex, 1);
      return;
    }
    if (this.current?.occurrence.id === occurrence.id) {
      this.current.controller.abort();
      await this.current.done;
    }
  }

  /** Stops accepting new occurrences and drops the queue; the active run is untouched. */
  close(): void {
    this.state = 'closed';
    this.queue.length = 0;
  }

  /** Aborts only the active run and waits for it; queued occurrences are kept. */
  async stopCurrent(): Promise<void> {
    const current = this.current;
    if (!current) return;
    current.controller.abort();
    await current.done;
  }

  async whenIdle(timeoutMs: number): Promise<boolean> {
    const idle = (async () => {
      while (this.current) await this.current.done;
      return true;
    })();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    });
    try {
      return await Promise.race([idle, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  private launch(occurrence: Occurrence): void {
    const controller = new AbortController();
    const done = this.execute(occurrence, controller.signal);
    this.current = { occurrence, controller, done };
    this.deps.onChange();
  }

  private async execute(
    occurrence: Occurrence,
    signal: AbortSignal,
  ): Promise<void> {
    // Let launch() record `current` before the run can finish.
    await Promise.resolve();
    try {
      const result = await this.deps.runJob(
        occurrence.jobId,
        occurrence.id,
        signal,
      );
      if (result.authRequired) this.deps.onAuthRequired();
    } catch {
      // A failed run must not escape; the queue continues.
    } finally {
      this.current = undefined;
      const next = this.queue.shift();
      if (next) this.launch(next);
      else this.deps.onChange();
    }
  }
}
