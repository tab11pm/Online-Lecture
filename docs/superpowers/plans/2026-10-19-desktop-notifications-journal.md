# Уведомления и журнал десктопа — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Показать локальную историю запусков и ошибок в десктопе и отправлять системные уведомления о новых значимых событиях.

**Architecture:** `runs` остаётся источником истории запусков; новая таблица `desktop_events` хранит безопасные события и уникальные ключи уведомлений. Worker создаёт события при переходах состояния, объединяет запуски и ошибки в постраничный журнал и отправляет только новые события main. Main показывает Electron `Notification`, renderer запрашивает журнал через типизированный IPC.

**Tech Stack:** TypeScript, better-sqlite3, Electron, React, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-19-desktop-notifications-journal-design.md`, `openspec/changes/desktop-notifications-journal/specs/desktop-notifications-journal/spec.md`.

## Global Constraints

- Все данные только локально в `%LOCALAPPDATA%` пользователя Windows; телеметрия отсутствует.
- Страница журнала: 50 строк, от новых к старым; фильтр «Все / Ошибки», устойчивый курсор и явная загрузка следующей страницы.
- Renderer и уведомления не получают `Job.target`, raw `Run`, тексты исключений, cookies, query-параметры, join-URL или `sessionToken`.
- История запуска остаётся после удаления `Job`; старые запуски без названия показывают «Лекция».
- Старые события при старте не создают уведомлений; отказ `Notification` не останавливает ядро.
- `skipped` остаётся в журнале без системного уведомления; `completed`, `blocked`, `failed` имеют разные тексты.
- Живые BBB-состояния без подтверждённых фикстур не распознаются предположительными селекторами.

## Review Focus

- Терминальный `Run` без события после аварии: первая страница показывает запуск, восстановление события не отправляет старое уведомление (Task 1–2).
- Два одинаковых terminal update и повторный IPC: в SQLite одна запись и один системный toast (Task 2 и 4).
- Новая запись между страницами: курсор не повторяет и не пропускает старые записи (Task 1).
- Удалённое задание и внешнее название с секретом: журнал показывает отредактированное сохранённое название или «Лекция» (Task 1).
- Ошибка показа уведомления и закрытое окно: запуск продолжается; при клике окно открывает журнал (Task 4).

---

## Карта файлов

- `src/persistence/sqlite-store.ts`, новый `src/persistence/desktop-event-repository.ts`: идемпотентная таблица событий, уникальные ключи и объединённая постраничная выборка с `runs`.
- `src/core/types.ts`, `src/core/lecture-session-controller.ts`: устойчивый код `retries_exhausted` в терминальном `Run`.
- Новый `apps/desktop/src/shared/journal.ts`: допустимые коды, безопасные строки журнала, фильтр и форма страницы.
- Новый `apps/desktop/src/worker/journal-service.ts`: запись событий, восстановление пропущенных terminal events, безопасные сообщения и страницы.
- `apps/desktop/src/worker/lecture-service.ts`, `core-host.ts`, `entry.ts`: источники событий и доставка в host.
- `apps/desktop/src/shared/{host-protocol,ipc-contract}.ts`, `apps/desktop/src/main/{core-process,ipc,index}.ts`, `apps/desktop/src/preload/index.ts`: запрос страниц, push событий и системный toast.
- Новый `apps/desktop/src/main/desktop-notifier.ts`: Electron `Notification` с инъекцией конструктора для тестов.
- `apps/desktop/src/renderer/src/{App,components/MainScreen}.tsx`, новый `components/JournalScreen.tsx`: навигация, список и фильтр.

### Task 1: Хранилище событий и постраничная история

**Files:** `src/persistence/sqlite-store.ts`, создать `src/persistence/desktop-event-repository.ts`, `apps/desktop/src/shared/journal.ts`; тесты `tests/persistence/desktop-event-repository.test.ts`.

**Interfaces:** В `src/persistence/desktop-event-repository.ts`: `JournalCode = 'login_succeeded' | 'auth_required' | 'search_ambiguous' | 'import_error' | 'core_error' | 'retries_exhausted' | 'lecture_finished'`, `StoredJournalRecord` (запуск или событие с устойчивым ID, временем, кодом/статусом и безопасным названием), `DesktopEventRepository.insert(input: { key: string; code: JournalCode; at: string; title?: string; jobId?: string; occurrenceId?: string }): Promise<{ id: number; created: boolean }>`, `listPage(filter: 'all' | 'errors', cursor?: string): Promise<{ records: StoredJournalRecord[]; nextCursor?: string }>`, `recoverTerminalRuns(): Promise<number>`. В `apps/desktop/src/shared/journal.ts`: `JournalFilter = 'all' | 'errors'`, `JournalPage = { items: JournalItem[]; nextCursor?: string }`, `JournalItem = { id: string; at: string; title: string; status: RunStatus | JournalCode; reason?: CompletionReason | 'retries_exhausted'; isError: boolean }`. Ядро не импортирует типы desktop.

- [ ] **Step 1: Write failing tests** `keeps run after job deletion`, `returns 50 newest rows and stable next cursor when a newer event arrives`, `filters failed/blocked runs and error events`, `rejects malformed cursor`, `deduplicates event key`, `redacts external title before SQLite write`, `recovers a terminal run event once`.
- [ ] **Step 2: Run** `npx --no-install vitest run tests/persistence/desktop-event-repository.test.ts` — Expected: FAIL for missing repository.
- [ ] **Step 3: Implement** idempotent `desktop_events` schema and the interfaces above. Use `(at, sourceRank, stableId)` as opaque cursor order, keyset predicates on both sources, `LIMIT 51` per source before merge; `lecture_finished` events annotate `Run` rows and are not listed twice. Use `redactSensitiveText` before storage. A recovered event returns `created: true` to the repository but the caller suppresses its notification.
- [ ] **Step 4: Run** the targeted test and `npm run build` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: persist desktop journal events`.

### Task 2: Исчерпание повторов и события лекции

**Files:** `src/core/types.ts`, `src/core/lecture-session-controller.ts`, создать `apps/desktop/src/worker/journal-service.ts`, изменить `apps/desktop/src/worker/lecture-service.ts`; тесты `tests/core/lecture-session-controller.test.ts`, `apps/desktop/tests/worker/journal-service.test.ts`, `apps/desktop/tests/worker/lecture-service.test.ts`.

**Interfaces:** `Run.failureCode?: 'retries_exhausted'`; `JournalService.recordTerminalRun(run: Run, title: string, notify: boolean): Promise<void>`; `record(code: JournalCode, key: string, title?: string): Promise<void>`; `listPage(filter: JournalFilter, cursor?: string): Promise<JournalPage>`; `onNewEvent(event: { id: number; code: JournalCode; title: string }): void`. `JournalService` converts Task 1 `StoredJournalRecord` into the desktop view.

- [ ] **Step 1: Write failing tests** `sets failureCode only when retry delay is exhausted`, `terminal update produces one event and one callback`, `two writes of same terminal run stay idempotent`, `startup recovery fills missing event without callback`, `manual stop and skipped run do not claim retries exhausted`, `failureCode survives SQLite reload`.
- [ ] **Step 2: Run** `npx --no-install vitest run tests/core/lecture-session-controller.test.ts apps/desktop/tests/worker/journal-service.test.ts apps/desktop/tests/worker/lecture-service.test.ts` — Expected: FAIL on new behavior.
- [ ] **Step 3: Implement** `failureCode` at the controller's `nextRetryDelay(...) === undefined` branch and pass the terminal `Run` from the notifying repository to `JournalService`. At worker start, call `recoverTerminalRuns()` before enabling event push. Keep `skipped` in history without toast; map `failed` plus `failureCode` to a single `retries_exhausted` event, other terminal results to `lecture_finished`.
- [ ] **Step 4: Run** targeted tests and `npm run build` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop): record lecture outcomes`.

### Task 3: События входа, импорта и поиска

**Files:** `apps/desktop/src/worker/{core-host,lecture-service,import-scheduler}.ts`; тесты `apps/desktop/tests/worker/{core-host,lecture-service,import-scheduler}.test.ts`.

**Interfaces:** Uses Task 2 `JournalService.record(code, key, title?)`; exposes `LectureService.recordSystemEvent(code: JournalCode, key: string, title?: string): Promise<void>` to `CoreHost` after database readiness.

- [ ] **Step 1: Write failing tests** `interactive login success is recorded once while restored session is silent`, `auth_required is recorded once until next successful login`, `one failed import attempt yields one import_error`, `ambiguous lookup yields one search_ambiguous per request`, `core failure writes core_error code without exception text`, `database unavailable still reports host.error without crashing`.
- [ ] **Step 2: Run** `npm test -w @online-lecture/desktop -- core-host lecture-service import-scheduler` — Expected: FAIL on new events.
- [ ] **Step 3: Implement** event calls at operation completion, using a generated attempt ID for import/search/error and an auth episode key reset by successful interactive login. Do not infer login success from `session_ready` on startup. Preserve technical details only in `core.log`; event title and code pass redaction.
- [ ] **Step 4: Run** targeted tests and `npm run build` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop): record onboarding and import events`.

### Task 4: IPC и системные уведомления

**Files:** `apps/desktop/src/shared/{host-protocol,ipc-contract}.ts`, `apps/desktop/src/main/{core-process,ipc,index,desktop-notifier}.ts`, `apps/desktop/src/preload/index.ts`, `apps/desktop/src/worker/core-host.ts`; тесты `apps/desktop/tests/main/{core-process,ipc,desktop-notifier}.test.ts`, `apps/desktop/tests/worker/core-host.test.ts`.

**Interfaces:** `MainCommand { type: 'journal.list'; requestId: string; filter: JournalFilter; cursor?: string }`; `HostEvent { type: 'journal.result'; requestId: string; ok: true; page: JournalPage } | { type: 'journal.result'; requestId: string; ok: false; message: string } | { type: 'journal.event'; event: { id: number; code: JournalCode; title: string } }`; `DesktopApi.journal.list(filter: JournalFilter, cursor?: string): Promise<JournalPage>`; `DesktopApi.journal.onOpen(listener: () => void): () => void`; `DesktopNotifier.show(event): void`.

- [ ] **Step 1: Write failing tests** `rejects invalid filter/oversized cursor before worker dispatch`, `worker exit rejects pending journal page`, `same event ID shows one notification`, `show failure leaves core running`, `click opens or creates window and emits journal open`, `event title with token cannot reach Notification`.
- [ ] **Step 2: Run** `npm test -w @online-lecture/desktop -- core-process ipc desktop-notifier core-host` — Expected: FAIL on new channels.
- [ ] **Step 3: Implement** typed request/reply using the existing correlation ID pattern, with 30 s read timeout; validate `filter` and cursor length ≤ 512 in main and worker. `DesktopNotifier` accepts an injected Notification factory, deduplicates IDs per main process, maps codes to fixed Russian copy, catches `show()` failures and calls `showMainWindow()` plus renderer `journal.onOpen` on click. Keep event titles redacted at worker and main boundaries.
- [ ] **Step 4: Run** targeted tests and `npm run build` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop): deliver journal and system notifications`.

### Task 5: Экран журнала и сквозная проверка

**Files:** `apps/desktop/src/renderer/src/{App,components/MainScreen,components/JournalScreen}.tsx`, `apps/desktop/tests/renderer/{main-screen,journal-screen}.test.tsx`, `apps/desktop/tests/e2e/lectures.test.ts`, `docs/HANDOFF.md`, `openspec/changes/desktop-notifications-journal/tasks.md`.

**Interfaces:** Uses Task 4 `DesktopApi.journal.list/onOpen`; no new runtime API.

- [ ] **Step 1: Write failing tests** `opens journal from main button or toast click`, `shows newest first and distinct completed/blocked/failed labels`, `filters errors`, `loads next page once without duplicate rows`, `shows empty and load-error states`, `renders redacted long title without exposing target URL`. Extend fake-session E2E with one completed and one failed event; assert navigation and history without real TUSUR network.
- [ ] **Step 2: Run** `npm test -w @online-lecture/desktop -- main-screen journal-screen` — Expected: FAIL on missing screen.
- [ ] **Step 3: Implement** accessible `JournalScreen` inside current window: visible back button, «Все / Ошибки», `role="status"` for loading/empty, `role="alert"` for load errors, focus on heading after navigation, explicit «Показать ещё» using cursor. Keep the current UI language; compare actual render with the locked existing screen and Refero craft rules.
- [ ] **Step 4: Run** targeted tests, `npm test`, `npm run build`, and `npm run build -w @online-lecture/desktop`. Run `CI_ELECTRON_E2E=1 npm test -w @online-lecture/desktop -- lectures` when Electron binary and display are available; otherwise record the skipped gate in `HANDOFF.md`. Run `git diff --check` and OpenSpec validation if its CLI is installed. Expected: tests/build PASS, no new whitespace errors.
- [ ] **Step 5: Update** `HANDOFF.md` with feature behavior, notification limitations and Windows toast check; mark implemented OpenSpec tasks. Commit `feat(desktop): add journal screen`.
