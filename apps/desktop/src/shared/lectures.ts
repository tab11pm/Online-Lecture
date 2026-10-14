import type { CompletionReason, RunStatus } from '@core/core/types.js';

export type ImportStage =
  'group' | 'schedule' | 'courses' | 'lectures' | 'saving';

export interface ImportSummaryView {
  added: number;
  removed: number;
  complete: boolean;
}

export type ImportView =
  | { status: 'idle'; lastSuccessAt?: string }
  | { status: 'running'; stage: ImportStage; lastSuccessAt?: string }
  | {
      status: 'done';
      at: string;
      summary: ImportSummaryView;
      unresolved: string[];
    }
  | { status: 'failed'; at: string; message: string; lastSuccessAt?: string };

export interface AgendaItem {
  jobId: string;
  occurrenceId: string;
  title: string;
  date: string;
  joinAt: string;
  leaveAt: string;
  skipped: boolean;
  runStatus?: RunStatus;
}

export interface LecturesView {
  current?: {
    jobId: string;
    occurrenceId: string;
    title: string;
    leaveAt: string;
    status: RunStatus;
  };
  next?: AgendaItem;
  agenda: AgendaItem[];
  import: ImportView;
  lastRun?: {
    title: string;
    status: RunStatus;
    completionReason?: CompletionReason;
    at: string;
  };
}

export type LectureBrowserOptions = { channel?: 'msedge'; headless: boolean };
