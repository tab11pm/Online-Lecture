import type { CompletionReason, Run, RunStatus } from '@core/core/types.js';
import { redactSensitiveText } from '@core/core/redaction.js';
import {
  DesktopEventRepository,
  type JournalCode,
} from '@core/persistence/desktop-event-repository.js';
import type { JournalFilter, JournalPage } from '../shared/journal.js';

export interface NewJournalEvent {
  id: number;
  code: JournalCode;
  title: string;
  status?: RunStatus;
  reason?: CompletionReason | 'retries_exhausted';
}

/** Bridges durable journal rows to safe desktop notifications. */
export class JournalService {
  constructor(
    private readonly events: DesktopEventRepository,
    private readonly onNewEvent: (event: NewJournalEvent) => void,
    private readonly now: () => Date,
  ) {}

  async recover(): Promise<number> {
    return this.events.recoverTerminalRuns();
  }

  async recordTerminalRun(
    run: Run,
    title: string,
    notify: boolean,
  ): Promise<void> {
    if (!['completed', 'blocked', 'failed'].includes(run.status)) return;
    const code: JournalCode =
      run.failureCode === 'retries_exhausted'
        ? 'retries_exhausted'
        : 'lecture_finished';
    const safeTitle = redactSensitiveText(title);
    const result = await this.events.insert({
      key: `terminal:${run.jobId}:${run.occurrenceId}:${run.status}`,
      code,
      at: run.updatedAt,
      title: safeTitle,
      jobId: run.jobId,
      occurrenceId: run.occurrenceId,
    });
    if (result.created && notify) {
      this.onNewEvent({
        id: result.id,
        code,
        title: safeTitle,
        status: run.status,
        ...(run.failureCode
          ? { reason: run.failureCode }
          : run.completionReason
            ? { reason: run.completionReason }
            : {}),
      });
    }
  }

  async record(code: JournalCode, key: string, title?: string): Promise<void> {
    const safeTitle = redactSensitiveText(title ?? 'Приложение');
    const result = await this.events.insert({
      key,
      code,
      at: this.now().toISOString(),
      title: safeTitle,
    });
    if (result.created)
      this.onNewEvent({ id: result.id, code, title: safeTitle });
  }

  async listPage(filter: JournalFilter, cursor?: string): Promise<JournalPage> {
    const page = await this.events.listPage(filter, cursor);
    return {
      items: page.records,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  }
}
