export interface SchedulerLoopDependencies {
  check(now: Date): Promise<unknown>;
  now(): Date;
  intervalMs?: number;
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
  onError(error: unknown): void;
}

const DEFAULT_INTERVAL_MS = 30_000;

export class SchedulerLoop {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<void> | undefined;

  constructor(private readonly deps: SchedulerLoopDependencies) {}

  start(): void {
    if (this.timer !== undefined) return;
    const set = this.deps.setInterval ?? setInterval;
    this.timer = set(
      () => void this.tick(),
      this.deps.intervalMs ?? DEFAULT_INTERVAL_MS,
    );
    void this.tick();
  }

  stop(): void {
    if (this.timer === undefined) return;
    (this.deps.clearInterval ?? clearInterval)(this.timer);
    this.timer = undefined;
  }

  /** Runs one check; a tick requested during a running tick joins it. */
  tick(): Promise<void> {
    if (this.running) return this.running;
    this.running = (async () => {
      try {
        await this.deps.check(this.deps.now());
      } catch (error) {
        this.deps.onError(error);
      } finally {
        this.running = undefined;
      }
    })();
    return this.running;
  }
}
