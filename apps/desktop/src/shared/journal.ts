import type { CompletionReason, RunStatus } from '@core/core/types.js';
import type { JournalCode } from '@core/persistence/desktop-event-repository.js';

export type JournalFilter = 'all' | 'errors';

export interface JournalItem {
  id: string;
  at: string;
  title: string;
  status: RunStatus | JournalCode;
  reason?: CompletionReason | 'retries_exhausted';
  isError: boolean;
}

export interface JournalPage {
  items: JournalItem[];
  nextCursor?: string;
}
