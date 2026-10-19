import type { BrowserView } from '../../../shared/browser-choice.js';
import type { JournalItem } from '../../../shared/journal.js';
import type {
  AgendaItem,
  LecturesView,
  ManualTargetCandidate,
} from '../../../shared/lectures.js';
import type { OnboardingState } from '../../../shared/onboarding.js';

export type PreviewAction =
  | { kind: 'click'; text: string; delay?: number }
  | { kind: 'fill'; label: string; value: string; delay?: number };

export interface PreviewScenario {
  state: OnboardingState;
  view: LecturesView;
  browser: BrowserView;
  journalOpen?: boolean;
  journalEmpty?: boolean;
  actions?: PreviewAction[];
}

const TODAY = '2026-10-19';
const TOMORROW = '2026-10-20';

export const agenda: AgendaItem[] = [
  {
    jobId: 'tt:math',
    occurrenceId: 'tt:math:2026-10-19',
    title: 'Математический анализ',
    source: 'timetable',
    editable: true,
    date: TODAY,
    joinAt: '10:00',
    leaveAt: '11:35',
    skipped: false,
    runStatus: 'connected',
  },
  {
    jobId: 'tt:physics',
    occurrenceId: 'tt:physics:2026-10-19',
    title: 'Физика',
    source: 'timetable',
    editable: true,
    date: TODAY,
    joinAt: '12:15',
    leaveAt: '13:50',
    skipped: false,
  },
  {
    jobId: 'tt:history',
    occurrenceId: 'tt:history:2026-10-19',
    title: 'История',
    source: 'timetable',
    editable: true,
    date: TODAY,
    joinAt: '14:00',
    leaveAt: '15:35',
    skipped: true,
    runStatus: 'skipped',
  },
  {
    jobId: 'manual:discrete',
    occurrenceId: 'manual:discrete:2026-10-20',
    title: 'Дискретная математика',
    source: 'manual',
    editable: false,
    date: TOMORROW,
    joinAt: '09:50',
    leaveAt: '11:25',
    skipped: false,
  },
  {
    jobId: 'manual:probability',
    occurrenceId: 'manual:probability:2026-10-20',
    title: 'Теория вероятностей',
    source: 'manual',
    editable: false,
    date: TOMORROW,
    joinAt: '12:15',
    leaveAt: '13:50',
    skipped: false,
    rescheduledFrom: { jobId: 'tt:probability', date: TODAY },
  },
];

const idleImport = {
  status: 'idle' as const,
  lastSuccessAt: '2026-10-19T09:41:00+07:00',
};

const lastRun = {
  title: 'История',
  status: 'completed' as const,
  completionReason: 'manual' as const,
  at: '2026-10-18T15:35:00+07:00',
};

const liveView: LecturesView = {
  current: {
    jobId: 'tt:math',
    occurrenceId: 'tt:math:2026-10-19',
    title: 'Математический анализ',
    leaveAt: '2026-10-19T11:35:00+07:00',
    status: 'connected',
  },
  next: agenda[1],
  agenda,
  import: idleImport,
  lastRun,
};

const idleView: LecturesView = {
  next: agenda[3],
  agenda,
  import: idleImport,
  lastRun,
};

const emptyView: LecturesView = {
  agenda: [],
  import: idleImport,
};

const browserEdge: BrowserView = {
  choice: 'edge',
  install: { status: 'missing' },
};

const browserChromium: BrowserView = {
  choice: 'chromium',
  install: { status: 'missing' },
};

const sessionReady: OnboardingState = { phase: 'session_ready' };

export const manualCandidates: ManualTargetCandidate[] = [
  {
    id: 'candidate-lecture',
    name: 'Онлайн-лекция №4',
    type: 'lecture',
    courseName: 'Математический анализ',
  },
  {
    id: 'candidate-practical',
    name: 'Практика №4',
    type: 'practical',
    courseName: 'Математический анализ',
  },
];

export const journalItems: JournalItem[] = [
  {
    id: 'j-1',
    at: '2026-10-19T11:35:00+07:00',
    title: 'Математический анализ',
    status: 'completed',
    reason: 'manual',
    isError: false,
  },
  {
    id: 'j-2',
    at: '2026-10-19T09:41:00+07:00',
    title: 'Расписание ТУСУР',
    status: 'import_error',
    isError: true,
  },
  {
    id: 'j-3',
    at: '2026-10-18T18:03:00+07:00',
    title: 'Физика',
    status: 'failed',
    reason: 'retries_exhausted',
    isError: true,
  },
  {
    id: 'j-4',
    at: '2026-10-18T16:00:00+07:00',
    title: 'Вход в ТУСУР',
    status: 'login_succeeded',
    isError: false,
  },
  {
    id: 'j-5',
    at: '2026-10-17T10:05:00+07:00',
    title: 'История',
    status: 'skipped',
    isError: false,
  },
  {
    id: 'j-6',
    at: '2026-10-16T08:55:00+07:00',
    title: 'Дискретная математика',
    status: 'completed',
    reason: 'meeting_ended',
    isError: false,
  },
];

const wizardActions: PreviewAction[] = [
  { kind: 'click', text: 'Добавить пару', delay: 400 },
  {
    kind: 'fill',
    label: 'Курс СДО или ссылка на курс',
    value: 'Математический анализ',
  },
  { kind: 'click', text: 'Найти активность', delay: 160 },
  { kind: 'click', text: 'Онлайн-лекция №4', delay: 420 },
  {
    kind: 'fill',
    label: 'Дата',
    value: '2026-10-21',
  },
  { kind: 'fill', label: 'Вход', value: '12:15' },
  { kind: 'fill', label: 'Выход', value: '13:50' },
];

export const scenarios: Record<string, PreviewScenario> = {
  welcome: {
    state: { phase: 'welcome' },
    view: idleView,
    browser: browserEdge,
  },
  credentials: {
    state: { phase: 'credentials' },
    view: idleView,
    browser: browserEdge,
  },
  authenticating: {
    state: { phase: 'authenticating' },
    view: idleView,
    browser: browserEdge,
  },
  'manual-sso': {
    state: { phase: 'manual_sso' },
    view: idleView,
    browser: browserEdge,
  },
  'login-failed': {
    state: {
      phase: 'failed',
      message: 'Неверный логин или пароль. Проверьте раскладку и повторите.',
    },
    view: idleView,
    browser: browserEdge,
  },
  schedule: {
    state: sessionReady,
    view: liveView,
    browser: browserEdge,
  },
  'schedule-idle': {
    state: sessionReady,
    view: idleView,
    browser: browserEdge,
  },
  'schedule-empty': {
    state: sessionReady,
    view: emptyView,
    browser: browserEdge,
  },
  'import-running': {
    state: sessionReady,
    view: {
      ...liveView,
      current: undefined,
      import: {
        status: 'running',
        stage: 'courses',
        lastSuccessAt: '2026-10-19T09:41:00+07:00',
      },
    },
    browser: browserEdge,
  },
  'import-error': {
    state: sessionReady,
    view: {
      ...liveView,
      current: undefined,
      import: {
        status: 'failed',
        at: '2026-10-19T09:58:00+07:00',
        message:
          'Не удалось обновить расписание: нет связи с timetable.tusur.ru.',
        lastSuccessAt: '2026-10-19T09:41:00+07:00',
      },
    },
    browser: browserEdge,
  },
  chromium: {
    state: sessionReady,
    view: liveView,
    browser: browserChromium,
  },
  journal: {
    state: sessionReady,
    view: liveView,
    browser: browserEdge,
    journalOpen: true,
  },
  'journal-errors': {
    state: sessionReady,
    view: liveView,
    browser: browserEdge,
    journalOpen: true,
    actions: [{ kind: 'click', text: 'Ошибки', delay: 450 }],
  },
  'journal-empty': {
    state: sessionReady,
    view: liveView,
    browser: browserEdge,
    journalOpen: true,
    journalEmpty: true,
    actions: [{ kind: 'click', text: 'Ошибки', delay: 450 }],
  },
  'add-lecture': {
    state: sessionReady,
    view: liveView,
    browser: browserEdge,
    actions: [{ kind: 'click', text: 'Добавить пару', delay: 400 }],
  },
  'add-lecture-search': {
    state: sessionReady,
    view: liveView,
    browser: browserEdge,
    actions: wizardActions,
  },
  'edit-time': {
    state: sessionReady,
    view: liveView,
    browser: browserEdge,
    actions: [{ kind: 'click', text: 'Изменить / перенести', delay: 450 }],
  },
  'edit-move': {
    state: sessionReady,
    view: liveView,
    browser: browserEdge,
    actions: [
      { kind: 'click', text: 'Изменить / перенести', delay: 450 },
      { kind: 'click', text: 'Перенести на другую дату', delay: 200 },
    ],
  },
  settings: {
    state: sessionReady,
    view: liveView,
    browser: browserEdge,
    actions: [{ kind: 'click', text: 'Настройки', delay: 450 }],
  },
};

export const screens: Array<[id: string, label: string]> = [
  ['welcome', 'Приветствие'],
  ['credentials', 'Вход'],
  ['authenticating', 'Проверка'],
  ['manual-sso', 'SSO'],
  ['login-failed', 'Ошибка входа'],
  ['schedule', 'Расписание'],
  ['schedule-idle', 'Дальше'],
  ['schedule-empty', 'Пусто'],
  ['import-running', 'Импорт'],
  ['import-error', 'Ошибка импорта'],
  ['chromium', 'Chromium'],
  ['journal', 'Журнал'],
  ['journal-errors', 'Журнал · ошибки'],
  ['journal-empty', 'Журнал · пусто'],
  ['add-lecture', 'Новая пара'],
  ['add-lecture-search', 'Поиск пары'],
  ['edit-time', 'Изменить время'],
  ['edit-move', 'Перенос'],
  ['settings', 'Настройки'],
];
