import type { BrowserChoice } from '../../../shared/browser-choice.js';
import type { DesktopApi } from '../../../shared/ipc-contract.js';
import type { JournalFilter, JournalPage } from '../../../shared/journal.js';
import { journalItems, manualCandidates } from './scenarios';
import type { PreviewScenario } from './scenarios';

function noUnsubscribe(): () => void {
  return () => undefined;
}

export function installMock(scenario: PreviewScenario): void {
  const api: DesktopApi = {
    onboarding: {
      getState: async () => scenario.state,
      login: async () => ({ ok: true }),
      openManualSso: async () => ({ ok: true }),
      checkSession: async () => scenario.state,
      onChanged: noUnsubscribe,
    },
    app: {
      getInfo: async () => ({ version: '0.1.0', autostart: true }),
      getBrowser: async () => scenario.browser,
      setBrowser: async (choice: BrowserChoice) => ({
        ...scenario.browser,
        choice,
      }),
      installChromium: async () => ({
        choice: 'chromium',
        install: { status: 'available' },
      }),
      onBrowserChanged: noUnsubscribe,
      setAutostart: async (enabled: boolean) => ({
        version: '0.1.0',
        autostart: enabled,
      }),
      quit: async () => undefined,
      getShowLectureWindow: async () => true,
      setShowLectureWindow: async (show: boolean) => show,
    },
    lectures: {
      getView: async () => scenario.view,
      importNow: async () => undefined,
      stopCurrent: async () => undefined,
      setSkipped: async () => undefined,
      resolveManualTarget: async () => ({
        status: 'ambiguous',
        candidates: manualCandidates,
      }),
      saveManual: async () => undefined,
      editImportedTime: async () => undefined,
      reschedule: async () => 'manual:2',
      cancelReschedule: async () => undefined,
      deleteLecture: async () => undefined,
      onChanged: noUnsubscribe,
    },
    journal: {
      list: async (
        filter: JournalFilter,
        cursor?: string,
      ): Promise<JournalPage> => {
        if (scenario.journalEmpty) return { items: [] };
        const items =
          filter === 'errors'
            ? journalItems.filter((item) => item.isError)
            : journalItems;
        if (cursor) return { items: [], nextCursor: undefined };
        return {
          items,
          nextCursor: filter === 'all' ? 'page-2' : undefined,
        };
      },
      consumeOpenRequest: async () => scenario.journalOpen ?? false,
      onOpen: noUnsubscribe,
    },
    core: {
      getStatus: async () => 'running',
      start: async () => 'running',
      stop: async () => 'stopped',
      onStatusChanged: noUnsubscribe,
      onNotification: noUnsubscribe,
    },
  };

  (window as unknown as { desktop: DesktopApi }).desktop = api;
}
