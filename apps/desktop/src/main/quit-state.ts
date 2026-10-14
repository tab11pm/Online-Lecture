export type QuitState = 'running' | 'shuttingDown' | 'done';
export type QuitDecision = 'begin-shutdown' | 'prevent' | 'proceed';

/** Explicit quit state machine: running -> shuttingDown -> done. */
export class QuitController {
  state: QuitState = 'running';

  onBeforeQuit(): QuitDecision {
    switch (this.state) {
      case 'running':
        this.state = 'shuttingDown';
        return 'begin-shutdown';
      case 'shuttingDown':
        return 'prevent';
      case 'done':
        return 'proceed';
    }
  }

  finishShutdown(): void {
    this.state = 'done';
  }

  isQuitting(): boolean {
    return this.state === 'done';
  }
}
