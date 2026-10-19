import type { LoginInput } from './ipc-contract.js';
import type { LoginOutcome, OnboardingState } from './onboarding.js';
import type { BrowserChoice } from './browser-choice.js';
import type { LecturesView } from './lectures.js';
import type { JournalFilter, JournalPage, NewJournalEvent } from './journal.js';
import type {
  EditImportedTimeInput,
  ManualScheduleInput,
  RescheduleInput,
} from '@core/core/schedule-editing.js';

export type MainCommand =
  | { type: 'onboarding.login'; input: LoginInput }
  | { type: 'onboarding.openManualSso' }
  | { type: 'onboarding.checkSession' }
  | { type: 'onboarding.getState' }
  | { type: 'browser.setChoice'; choice: BrowserChoice }
  | { type: 'lectures.getView' }
  | {
      type: 'journal.list';
      requestId: string;
      filter: JournalFilter;
      cursor?: string;
    }
  | { type: 'lectures.import' }
  | { type: 'lectures.stopCurrent' }
  | {
      type: 'lectures.setSkipped';
      jobId: string;
      occurrenceId: string;
      skipped: boolean;
    }
  | { type: 'lectures.setShowWindow'; show: boolean }
  | { type: 'lectures.resolveManualTarget'; requestId: string; query: string }
  | {
      type: 'lectures.saveManual';
      requestId: string;
      input: {
        candidateId: string;
        title: string;
        schedule: ManualScheduleInput;
      };
    }
  | {
      type: 'lectures.editImportedTime';
      requestId: string;
      input: EditImportedTimeInput;
    }
  | { type: 'lectures.reschedule'; requestId: string; input: RescheduleInput }
  | { type: 'lectures.cancelReschedule'; requestId: string; jobId: string }
  | {
      type: 'lectures.deleteLecture';
      requestId: string;
      jobId: string;
      occurrenceId?: string;
    }
  | { type: 'system.resumed' }
  | { type: 'app.shutdown' };

export type HostEvent =
  | { type: 'host.ready' }
  | { type: 'onboarding.changed'; state: OnboardingState }
  | { type: 'onboarding.loginResult'; outcome: LoginOutcome }
  | { type: 'lectures.changed'; view: LecturesView }
  | { type: 'journal.result'; requestId: string; ok: true; page: JournalPage }
  | { type: 'journal.result'; requestId: string; ok: false; message: string }
  | { type: 'journal.event'; event: NewJournalEvent }
  | {
      type: 'lectures.commandResult';
      requestId: string;
      ok: true;
      value?: unknown;
    }
  | {
      type: 'lectures.commandResult';
      requestId: string;
      ok: false;
      message: string;
    }
  | { type: 'host.shutdownComplete' }
  | { type: 'host.error'; message: string };
