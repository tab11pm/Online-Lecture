# Автопосещение лекций в десктопе (slice 2a) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** После входа десктоп сам импортирует онлайн-пары, в фоне посещает лекции и даёт остановить или пропустить пару из окна и трея.

**Architecture:** Ядро (`src/`) получает сервис импорта, повестку и транзакционные операции SQLite. Worker собирает их в `LectureService` (импорт по расписанию, планировщик, один активный запуск) и публикует целиковый снимок `LecturesView`. Main ретранслирует команды, ведёт трей, `powerMonitor` и настройки; renderer показывает главный экран.

**Tech Stack:** TypeScript (ESM), better-sqlite3, luxon, Playwright, Electron 44 (utilityProcess), React 19, Vitest, OpenSpec.

**Spec:** `docs/superpowers/specs/2026-10-15-desktop-lectures-design.md`, `openspec/changes/desktop-lectures/specs/desktop-lectures/spec.md`.

## Global Constraints

- Ядро в `src/` не импортирует Electron; worker и main не дублируют правила слияния и жизненного цикла.
- Импорт: после входа; при запуске — если последний успешный старше 24 ч; раз в сутки; по кнопке. Автоматический импорт откладывается во время лекции; после ошибки автоповтор не чаще раза в час; второй импорт во время первого не запускается.
- Частичный импорт сохраняет найденное без удаления старого; удаление только при полном импорте (текущее правило CLI). `auth_required` и ошибка не меняют базу.
- Планировщик: тик 30 с и сразу после `system.resumed`; одновременно не больше одной лекции; работает только в `session_ready`.
- Выход во время лекции: `abort()` и ожидание закрытия браузера не дольше 10 с.
- В `LecturesView`, логах и IPC нет URL курсов/активностей, cookies, `sessionToken`; ошибки проходят `redactSensitiveText`.
- `showLectureWindow` по умолчанию `true`; `headless = !showLectureWindow`.
- CLI `import`: вывод и коды выхода не меняются.
- Стиль: 2 пробела, kebab-case файлов, тесты рядом в `tests/` (ядро) и `apps/desktop/tests/{main,worker,renderer}`; новые файлы чистые по prettier/eslint.

## Review Focus

- Две пары одной дисциплины в один день: сейчас `findActiveOccurrence` берёт первое вхождение даты, вторая пара никогда не запустится — ожидается вход в ту, чьё окно идёт (Task 2).
- Импорт во время идущей лекции удаляет её задание (полный импорт без этой пары): лекция продолжается до своего `leaveAt`, остановка не происходит (Task 5).
- «Пропустить» на идущей лекции: сначала остановка с `manual`, затем флаг (Task 5).
- Сбой записи посреди импорта: база остаётся в прежнем состоянии целиком (Task 1).
- Повреждённое `showLectureWindow` в `settings.json`: значение по умолчанию `true` (Task 6).

---

## Карта файлов

- Ядро: `src/timetable/import-service.ts` (новый), `src/persistence/job-repository.ts`, `src/persistence/run-repository.ts`, `src/persistence/meta-repository.ts` (новый), `src/persistence/sqlite-store.ts`, `src/core/lecture-agenda.ts` (новый), `src/core/occurrence-suppression.ts` (новый), `src/core/occurrence.ts`, `src/core/job-runner.ts`, `src/cli/commands.ts`.
- Shared: `apps/desktop/src/shared/lectures.ts` (новый), `host-protocol.ts`, `ipc-contract.ts`.
- Worker: `single-lecture-runner.ts`, `scheduler-loop.ts`, `import-scheduler.ts`, `lecture-service.ts`, `lecture-adapters.ts`, `lecture-adapters.fake.ts` (новые), `core-host.ts`, `onboarding-machine.ts`, `sdo-mcp-session-provider.ts`, `entry.ts`.
- Main: `tray-state.ts` (новый), `tray.ts`, `settings-store.ts`, `core-process.ts`, `index.ts`, `ipc.ts`; `preload/index.ts`.
- Renderer: `components/MainScreen.tsx`, `LectureStatus.tsx`, `ImportPanel.tsx`, `AgendaList.tsx`, `SettingsPanel.tsx` (новые), `App.tsx`.

---

### Task 1: Сервис импорта и транзакционная запись

**Files:**
- Create: `src/timetable/import-service.ts`, `src/persistence/meta-repository.ts`, `tests/timetable/import-service.test.ts`, `tests/persistence/meta-repository.test.ts`
- Modify: `src/persistence/job-repository.ts`, `src/persistence/sqlite-store.ts`, `src/cli/commands.ts` (ветка `import`, строки ~71–156), `tests/persistence/job-repository.test.ts`

**Interfaces:**
- Produces:
  - `SqliteJobRepository.replaceTimetableJobs(jobs: Job[]): Promise<void>` — одна резервная копия, затем одна транзакция: удалить задания `source === 'timetable'`, которых нет в `jobs`, и upsert всех `jobs`.
  - `SqliteStore` схема: `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`.
  - `class SqliteMetaRepository { constructor(store: SqliteStore); get(key: string): string | undefined; set(key: string, value: string): void }`; ключ `LAST_IMPORT_KEY = 'timetable.lastImportAt'` экспортируется из `import-service.ts`.
  - `type ImportStage = 'group' | 'schedule' | 'courses' | 'lectures' | 'saving'`.
  - `interface TimetableImportDependencies { fetcher: HttpFetcher; resolver: OnlineLectureResolver; jobs: Pick<SqliteJobRepository, 'listAll' | 'replaceTimetableJobs'>; now(): Date; group?: { faculty: string; group: string } }`.
  - `type TimetableImportResult = { status: 'completed'; faculty: string; group: string; lessons: number; complete: boolean; summary: MergeSummary; unresolved: string[]; ambiguous: string[]; unmapped: string[] } | { status: 'auth_required' } | { status: 'failed'; message: string }` — `unresolved`/`ambiguous` = `OnlineDiscipline.discipline`, `unmapped` = уникальные `ParsedLesson.discipline`.
  - `runTimetableImport(deps: TimetableImportDependencies, options?: { onProgress?(stage: ImportStage): void }): Promise<TimetableImportResult>`. При `lessons === 0` запись не выполняется, `summary` нулевой.

- [ ] **Step 1: Write the failing tests**
  - `job-repository.test.ts`: `replaces timetable jobs atomically` — после ошибки внутри транзакции (подменить `JSON.stringify` для второго задания на бросок) `listAll()` равен исходному набору; `keeps manual jobs when replacing timetable jobs`.
  - `meta-repository.test.ts`: `stores and reads a value across reopen`; `returns undefined for a missing key`.
  - `import-service.test.ts` (фейковые фетчер по фикстурам `tests/fixtures/timetable/*` и резолвер, как в существующих CLI-тестах импорта):
    - `reports stages in order` → `['group','schedule','courses','lectures','saving']`;
    - `keeps existing jobs on a partial import` → резолвер `not_found` для одной дисциплины: `complete === false`, `unresolved` содержит её имя, прежнее задание этой дисциплины не удалено;
    - `prunes only on a complete import`;
    - `does not write on auth_required` и `does not write on failure` (фетчер бросает) → `replaceTimetableJobs` не вызывался, `failed.message` без `https://`;
    - `does not write when no online lessons` → `lessons: 0`.
- [ ] **Step 2: Run** `npx --no-install vitest run tests/timetable/import-service.test.ts tests/persistence` — Expected: FAIL (модуль/метод не найдены).
- [ ] **Step 3: Implement** `replaceTimetableJobs`, таблицу `meta`, `SqliteMetaRepository`, `runTimetableImport` (перенести конвейер из `commands.ts`; `complete` = нет `unmapped`, `unresolved`, `ambiguous`; `prune: complete`; ошибки → `redactSensitiveText`).
- [ ] **Step 4: Switch CLI `import`** на `runTimetableImport`: те же строки вывода (`No online lessons found`, `Authentication required for SDO; no changes applied`, `Imported: …`, `Import failed: …`) и коды выхода.
- [ ] **Step 5: Run** `npx --no-install vitest run tests/timetable tests/persistence tests/cli && npx --no-install tsc --noEmit` — Expected: PASS, существующие CLI-тесты импорта без изменений.
- [ ] **Step 6: Commit** `feat(core): extract timetable import service with atomic save`

### Task 2: Повестка, пропуск вхождения и восстановление запусков

**Files:**
- Create: `src/core/lecture-agenda.ts`, `src/core/occurrence-suppression.ts`, `tests/core/lecture-agenda.test.ts`, `tests/core/occurrence-suppression.test.ts`
- Modify: `src/core/occurrence.ts`, `src/persistence/run-repository.ts`, `src/core/job-runner.ts`, `tests/core/occurrence.test.ts`, `tests/persistence/run-repository.test.ts`, `tests/core/job-runner.test.ts`

**Interfaces:**
- Produces:
  - `interface AgendaEntry { jobId: string; occurrenceId: string; title: string; date: string; joinAt: string; leaveAt: string; joinAtIso: string; leaveAtIso: string; skipped: boolean; run?: Run }` — `occurrenceId` = `${job.id}:${joinAtIso}` (тот же формат, что у `findActiveOccurrence`); `title` = `origin.discipline` ?? `job.id`.
  - `interface Agenda { entries: AgendaEntry[]; current?: AgendaEntry; next?: AgendaEntry; lastRun?: AgendaEntry }` — `current`: окно содержит `now` и запуск в нетерминальном статусе; `next`: первое не пропущенное с `joinAtIso > now`; `lastRun`: последний по `run.updatedAt` с терминальным статусом.
  - `buildAgenda(jobs: Job[], runs: Run[], now: Date, days: number): Agenda` — разворачивает `imported`, `once`, `weekly` (только `enabled`), горизонт `[начало сегодняшнего дня, +days)` в зоне задания, сортировка по `joinAtIso`; пропущенные (`suppressed`) остаются в `entries` с `skipped: true`.
  - `setOccurrenceSuppressed(job: Job, occurrenceId: string, suppressed: boolean): Job` — только для `schedule.type === 'imported'`; ищет вхождение по `date` и `joinAt`, извлечённым из `occurrenceId` в зоне задания; иначе бросает `Error('Occurrence not found')`. Не мутирует вход.
  - `SqliteRunRepository.listAll(): Promise<Run[]>`; `SqliteRunRepository.failInterrupted(updatedAt: string): Promise<number>` — статусы `resolving|joining|waiting_room|connected|reconnecting|leaving` → `failed`, `completionReason: 'error'`, возвращает количество.
  - `RunResult.authRequired?: true` — выставляется в `JobRunner`, когда резолв вернул `auth_required`.

- [ ] **Step 1: Write the failing tests**
  - `occurrence.test.ts`: `picks the imported entry whose window contains now` — два вхождения на одну дату (`10:00–11:35`, `11:45–13:20`), `now = 12:00` → `joinAt` второго.
  - `lecture-agenda.test.ts`: `expands imported occurrences within the horizon sorted by time`; `marks suppressed entries as skipped and excludes them from next`; `reports the running entry as current`; `picks the latest terminal run as lastRun`; `uses the job timezone for date boundaries` (Asia/Krasnoyarsk, `now` в UTC около полуночи); `occurrence ids match findActiveOccurrence`.
  - `occurrence-suppression.test.ts`: `suppresses one occurrence and keeps the others`; `restores a suppressed occurrence`; `rejects non-imported jobs and unknown occurrences`; `does not mutate the input job`.
  - `run-repository.test.ts`: `fails interrupted runs and leaves terminal ones untouched`; `lists all runs`.
  - `job-runner.test.ts`: `flags authRequired when resolution needs a login`.
- [ ] **Step 2: Run** `npx --no-install vitest run tests/core tests/persistence` — Expected: FAIL.
- [ ] **Step 3: Implement** перечисленное; в `findActiveOccurrence` для `imported` выбирать вхождение даты, чьё окно содержит `now`.
- [ ] **Step 4: Run** `npx --no-install vitest run tests/core tests/persistence && npx --no-install tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): add lecture agenda, occurrence suppression and run recovery`

### Task 3: Один активный запуск и цикл планировщика (worker)

**Files:**
- Create: `apps/desktop/src/worker/single-lecture-runner.ts`, `apps/desktop/src/worker/scheduler-loop.ts`, `apps/desktop/tests/worker/single-lecture-runner.test.ts`, `apps/desktop/tests/worker/scheduler-loop.test.ts`

**Interfaces:**
- Consumes: `LectureRunner`, `Occurrence`, `CompletionReason` (`@core/core/types.js`); `RunResult` (`@core/core/job-runner.js`).
- Produces:
  - `type RunJobFn = (jobId: string, occurrenceId: string, signal: AbortSignal) => Promise<RunResult>`.
  - `class SingleLectureRunner implements LectureRunner { constructor(deps: { runJob: RunJobFn; onChange(): void; onAuthRequired(): void }); start(occurrence: Occurrence): Promise<void>; stop(occurrence: Occurrence, reason: CompletionReason): Promise<void>; stopCurrent(): Promise<void>; get active(): Occurrence | undefined; whenIdle(timeoutMs: number): Promise<boolean> }` — `start` не ждёт окончания лекции; при занятости ставит вхождение в очередь (FIFO); после завершения активного запускает следующее из очереди через тот же `runJob` (неактивное окно `JobRunner` сам переведёт в `skipped`); `stopCurrent` = abort + ожидание завершения; `whenIdle` → `true`, если успел, `false` по таймауту; `onAuthRequired` при `result.authRequired`; `onChange` при каждом старте и завершении.
  - `class SchedulerLoop { constructor(deps: { check(now: Date): Promise<unknown>; now(): Date; intervalMs?: number; setInterval?: typeof setInterval; clearInterval?: typeof clearInterval; onError(error: unknown): void }); start(): void; stop(): void; tick(): Promise<void> }` — `intervalMs` по умолчанию `30_000`; `start` выполняет немедленный `tick`; тики не перекрываются (тик во время тика объединяется с текущим).

- [ ] **Step 1: Write the failing tests**
  - `single-lecture-runner.test.ts`: `runs one occurrence at a time and queues the next`; `starts the queued occurrence after the active one ends`; `stopCurrent aborts the active run and waits for it`; `whenIdle times out while a run ignores the abort` → `false`; `reports authRequired results`; `does not queue the same occurrence twice`.
  - `scheduler-loop.test.ts` (fake timers): `ticks immediately and every 30 seconds`; `does not overlap ticks`; `stop cancels further ticks`; `reports check errors without stopping`.
- [ ] **Step 2: Run** `npm test -w @online-lecture/desktop -- single-lecture-runner scheduler-loop` — Expected: FAIL.
- [ ] **Step 3: Implement** оба класса.
- [ ] **Step 4: Run** ту же команду — Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop): run one lecture at a time from a scheduler loop`

### Task 4: Планировщик импорта (worker)

**Files:**
- Create: `apps/desktop/src/shared/lectures.ts`, `apps/desktop/src/worker/import-scheduler.ts`, `apps/desktop/tests/worker/import-scheduler.test.ts`

**Interfaces:**
- Consumes: `TimetableImportResult`, `ImportStage` (Task 1).
- Produces:
  - `shared/lectures.ts`: `LecturesView`, `AgendaItem`, `ImportView`, `ImportStage`, `ImportSummaryView` ровно как в разделе «Протокол» спеки; `ImportSummaryView = { added: number; removed: number; complete: boolean }`; `type LectureBrowserOptions = { channel?: 'msedge'; headless: boolean }`.
  - `type ImportTrigger = 'login' | 'startup' | 'daily' | 'manual' | 'retry'`.
  - `class ImportScheduler { constructor(deps: { runImport(onProgress: (stage: ImportStage) => void): Promise<TimetableImportResult>; isLectureActive(): boolean; lastSuccessAt(): Date | undefined; now(): Date; setTimeout?: typeof setTimeout; clearTimeout?: typeof clearTimeout; onView(view: ImportView): void; onAuthRequired(): void }); start(trigger: 'login' | 'startup'): void; request(trigger: ImportTrigger): Promise<void>; lectureFinished(): void; stop(): void; get view(): ImportView }` — константы `DAY_MS = 86_400_000`, `RETRY_MS = 3_600_000`.
  - Правила: `start('login')` → импорт; `start('startup')` → импорт, если `lastSuccessAt` отсутствует или старше суток; после успеха — таймер на сутки; после `failed` — таймер `retry` через час; `auth_required` → `onAuthRequired()` без повтора; автоматические триггеры при `isLectureActive()` откладываются до `lectureFinished()`; `manual` выполняется сразу; во время импорта `request` возвращает текущий промис.

- [ ] **Step 1: Write the failing tests** (fake timers): `imports after login`; `skips startup import when the last success is recent`; `imports on startup after 24 hours`; `schedules the next import a day after success`; `retries a failed import after one hour, not sooner`; `defers automatic imports during a lecture until it finishes`; `runs a manual import during a lecture`; `shares one run between concurrent requests`; `reports stages through the view`; `calls onAuthRequired without retrying`; `stop clears pending timers`.
- [ ] **Step 2: Run** `npm test -w @online-lecture/desktop -- import-scheduler` — Expected: FAIL.
- [ ] **Step 3: Implement** `shared/lectures.ts` и `ImportScheduler`.
- [ ] **Step 4: Run** ту же команду — Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop): schedule timetable imports in the core process`

### Task 5: LectureService и подключение к worker

**Files:**
- Create: `apps/desktop/src/worker/lecture-service.ts`, `apps/desktop/src/worker/lecture-adapters.ts`, `apps/desktop/src/worker/lecture-adapters.fake.ts`, `apps/desktop/tests/worker/lecture-service.test.ts`
- Modify: `apps/desktop/src/shared/host-protocol.ts`, `apps/desktop/src/worker/core-host.ts`, `apps/desktop/src/worker/onboarding-machine.ts`, `apps/desktop/src/worker/sdo-mcp-session-provider.ts`, `apps/desktop/src/worker/entry.ts`, `apps/desktop/tests/worker/core-host.test.ts`, `apps/desktop/tests/worker/onboarding-machine.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `interface LectureAdapters { runImport(jobs: SqliteJobRepository, onProgress: (stage: ImportStage) => void): Promise<TimetableImportResult>; runJob(jobs: SqliteJobRepository, runs: SqliteRunRepository, jobId: string, occurrenceId: string, signal: AbortSignal, browser: LectureBrowserOptions): Promise<RunResult> }`.
  - `lecture-adapters.ts`: `createLectureAdapters(input: { authStatePath: string; createMcpClient(): SdoMcpClient }): LectureAdapters` — импорт через `createPlaywrightFetcher({ authStatePath, channel })` + `runTimetableImport`; запуск через `new JobRunner(createMcpClient(), new PlaywrightBbbSessionManager({ channel }), jobs, runs).runJob(jobId, occurrenceId, signal)` с последующим `closeAll()`; канал импорта берётся из последних `browser`-опций.
  - `SdoMcpSessionProvider.createClient(authStatePath: string): SdoMcpClient` — тот же env, что у входа, без логина и пароля.
  - `lecture-adapters.fake.ts`: `createFakeLectureAdapters(now: () => Date): LectureAdapters` — импорт сохраняет одно задание `tt:fake:demo:1` с вхождением «сегодня, сейчас−1 мин … сейчас+90 мин» и дисциплиной «Демонстрационная лекция»; `runJob` переводит запуск в `connected` и ждёт abort, затем `completed/manual`.
  - `class LectureService { constructor(deps: { databasePath: string; adapters: LectureAdapters; now(): Date; onView(view: LecturesView): void; onAuthRequired(): void; log?: CoreLog }); open(): Promise<void>; activate(trigger: 'login' | 'startup'): void; deactivate(): void; getView(): LecturesView; importNow(): Promise<void>; stopCurrent(): Promise<void>; setSkipped(jobId: string, occurrenceId: string, skipped: boolean): Promise<void>; setBrowser(options: LectureBrowserOptions): void; resumed(): void; shutdown(timeoutMs: number): Promise<void> }` — `open` открывает SQLite и вызывает `failInterrupted`; `activate` идемпотентна; горизонт повестки 14 дней; `setSkipped` на активном вхождении сначала `stopCurrent()`; задание идущей лекции, удалённое импортом, не останавливает лекцию; `onView` после каждого изменения.
  - `OnboardingMachine.requireLogin(message: string): void` → состояние `{ phase: 'credentials', error: message }`, текст `'Сессия ТУСУР истекла. Войдите снова.'`.
  - `host-protocol.ts`: команды `lectures.getView`, `lectures.import`, `lectures.stopCurrent`, `lectures.setSkipped { jobId; occurrenceId; skipped }`, `lectures.setShowWindow { show: boolean }`, `system.resumed`, `app.shutdown`; события `lectures.changed { view: LecturesView }`, `host.shutdownComplete`.
  - `CoreHost`: `activate('login')` после успешного `onboarding.login`/`openManualSso`, `activate('startup')` при любом другом переходе в `session_ready`, `deactivate()` при выходе из `session_ready`; `onAuthRequired` → `machine.requireLogin(...)`; `browser.setChoice` и `lectures.setShowWindow` обновляют `setBrowser`; `app.shutdown` → `shutdown(10_000)` → `host.shutdownComplete`. `entry.ts` выбирает фейковые адаптеры при `ONLINE_LECTURE_FAKE_SESSION=1`.

- [ ] **Step 1: Write the failing tests**
  - `lecture-service.test.ts` (реальный SQLite во временной папке, фейковые адаптеры, fake timers): `fails interrupted runs on open`; `imports after login activation and publishes the agenda`; `starts the active occurrence and shows it as current`; `stopCurrent ends the run as manual and publishes lastRun`; `skipping the running occurrence stops it first`; `skipped occurrences are not started`; `keeps the running lecture when an import removes its job`; `stops scheduling after deactivate`; `reports auth_required from a run`; `passes channel and headless to runJob`; `fails a run without launching when the chosen browser is missing` (адаптер вызывает `assertBrowserAvailable(channel)` до `JobRunner`; запуск `failed`, сообщение «Браузер для лекции не установлен», задания на месте); `resumed triggers an immediate check`; `shutdown aborts and waits at most the timeout`; `view contains no URLs` (сериализованный `LecturesView` не содержит `http`).
  - `onboarding-machine.test.ts`: `requireLogin returns to credentials with the expiry message`.
  - `core-host.test.ts`: `activates lectures after a successful login`; `forwards lecture commands`; `requires login when lectures report auth_required`; `replies shutdownComplete after shutdown`.
- [ ] **Step 2: Run** `npm test -w @online-lecture/desktop -- lecture-service core-host onboarding-machine` — Expected: FAIL.
- [ ] **Step 3: Implement** перечисленное.
- [ ] **Step 4: Run** `npm test -w @online-lecture/desktop && npm run build` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop): attend lectures from the core process`

### Task 6: Main — ретрансляция, настройки, трей, сон и выход

**Files:**
- Create: `apps/desktop/src/main/tray-state.ts`, `apps/desktop/tests/main/tray-state.test.ts`
- Modify: `apps/desktop/src/main/{core-process,settings-store,tray,ipc,index}.ts`, `apps/desktop/src/shared/ipc-contract.ts`, `apps/desktop/src/preload/index.ts`, `apps/desktop/tests/main/{core-process,settings-store,ipc}.test.ts`

**Interfaces:**
- Consumes: протокол Task 5, `LecturesView` Task 4.
- Produces:
  - `AppSettings.showLectureWindow?: boolean` — только `boolean`, иначе отбрасывается; читатели трактуют отсутствие как `true`.
  - `CoreProcessOptions.initialShowLectureWindow: boolean` (отправляется при старте так же, как `initialBrowserChoice`); `CoreProcessCallbacks.onLecturesChanged(view: LecturesView): void`; методы `CoreProcess.getLecturesView(): LecturesView` (кэш последнего события, пустой снимок до первого), `importLectures()`, `stopCurrentLecture()`, `setLectureSkipped(jobId, occurrenceId, skipped)`, `setShowLectureWindow(show)`, `systemResumed()`, `shutdown(timeoutMs: number): Promise<void>` (ждёт `host.shutdownComplete` или таймаут, затем `stop()`).
  - `CHANNELS.lectures = { getView: 'lectures:getView', importNow: 'lectures:importNow', stopCurrent: 'lectures:stopCurrent', setSkipped: 'lectures:setSkipped', changed: 'lectures:changed' }`; `CHANNELS.app.getShowLectureWindow = 'app:getShowLectureWindow'`, `CHANNELS.app.setShowLectureWindow = 'app:setShowLectureWindow'`; `DesktopApi.lectures = { getView(): Promise<LecturesView>; importNow(): Promise<void>; stopCurrent(): Promise<void>; setSkipped(jobId: string, occurrenceId: string, skipped: boolean): Promise<void>; onChanged(listener: (view: LecturesView) => void): () => void }`; `DesktopApi.app.getShowLectureWindow(): Promise<boolean>`, `setShowLectureWindow(show: boolean): Promise<boolean>`.
  - `interface TrayState { tooltip: string; status: string; canStop: boolean }`; `trayStateFromView(view: LecturesView): TrayState` — текущая: `Лекция: <title> до HH:MM`, `canStop: true`; иначе ближайшая: `Ближайшая: <дд.мм> HH:MM <title>`; иначе `Онлайн-пар нет`. Подсказка = `Online Lecture — <status>`.
  - `createTray(options: TrayOptions & { onStop(): void }): { tray: Tray; update(state: TrayState): void }` — меню: неактивная строка статуса, «Открыть», «Остановить лекцию» (`enabled: canStop`), разделитель, «Выход».
  - `index.ts`: `powerMonitor.on('resume', () => core.systemResumed())`; первый `before-quit` → `event.preventDefault()`, `await core.shutdown(10_000)`, затем `app.quit()`.

- [ ] **Step 1: Write the failing tests**
  - `settings-store.test.ts`: `stores showLectureWindow`; `drops a non-boolean showLectureWindow`.
  - `core-process.test.ts`: `caches the latest lectures view`; `sends the initial show-window setting before queued commands flush`; `forwards lecture commands`; `shutdown waits for shutdownComplete`; `shutdown gives up after the timeout`.
  - `tray-state.test.ts`: `shows the running lecture with stop enabled`; `shows the next lecture`; `shows no lectures`.
  - `ipc.test.ts`: новые каналы зарегистрированы и не пробрасывают ошибки с секретами (по образцу существующих).
- [ ] **Step 2: Run** `npm test -w @online-lecture/desktop -- settings-store core-process tray-state ipc` — Expected: FAIL.
- [ ] **Step 3: Implement** перечисленное, включая preload-мост.
- [ ] **Step 4: Run** `npm test -w @online-lecture/desktop && npm run build` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop): relay lectures to the window and tray`

### Task 7: Главный экран

**Files:**
- Create: `apps/desktop/src/renderer/src/components/{MainScreen,LectureStatus,ImportPanel,AgendaList,SettingsPanel}.tsx`, `apps/desktop/tests/renderer/main-screen.test.tsx`
- Modify: `apps/desktop/src/renderer/src/App.tsx`, `apps/desktop/src/renderer/src/components/SessionReady.tsx` (кнопка «Проверить вход» переезжает в `SettingsPanel`; компонент удалить, если больше не используется), `apps/desktop/tests/renderer/onboarding.test.tsx`

**Interfaces:**
- Consumes: `window.desktop.lectures`, `window.desktop.app` (Task 6), `BrowserChoice`.
- Produces: `MainScreen` для `session_ready`. Тексты: «Сейчас идёт: <title>, до HH:MM», кнопка «Остановить»; «Ближайшая: <день недели> HH:MM <title>»; «Онлайн-пар не найдено»; «Обновить расписание»; стадии «Поиск группы», «Расписание», «Курсы СДО», «Лекции BBB», «Сохранение»; «Не удалось найти лекцию в СДО:»; «Пропустить»/«Вернуть»; «Показывать окно лекции»; «Проверить вход».

- [ ] **Step 1: Write the failing tests** (`main-screen.test.tsx`, фейковый `window.desktop`): `shows the running lecture with a stop button`; `shows the next lecture when idle`; `shows import progress and disables the refresh button while running`; `lists unresolved disciplines after a partial import`; `shows an import error with retry`; `toggles skip and restore for an occurrence`; `groups the agenda by day`; `toggles the lecture window setting`; `updates on lectures.onChanged`; в `onboarding.test.tsx` — `session_ready opens the main screen`.
- [ ] **Step 2: Run** `npm test -w @online-lecture/desktop -- main-screen onboarding` — Expected: FAIL.
- [ ] **Step 3: Implement** компоненты и переход в `App.tsx`.
- [ ] **Step 4: Run** `npm test -w @online-lecture/desktop` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop): add the main lectures screen`

### Task 8: E2E, документация и итоговая проверка

**Files:**
- Create: `apps/desktop/tests/e2e/lectures.test.ts`
- Modify: `docs/HANDOFF.md`, `openspec/changes/desktop-lectures/tasks.md` (создать по образцу `real-run-lifecycle`, отметить выполненное)

- [ ] **Step 1: Write the E2E test** (как `onboarding.test.ts`, `ONLINE_LECTURE_FAKE_SESSION=1`, пропуск без `CI_ELECTRON_E2E=1`): вход → главный экран → «Сейчас идёт: Демонстрационная лекция» → «Остановить» → статус последнего запуска «остановлено вручную».
- [ ] **Step 2: Run** `npm run build -w @online-lecture/desktop && CI_ELECTRON_E2E=1 npm test -w @online-lecture/desktop -- lectures` — Expected: PASS (если среда без дисплея — зафиксировать пропуск в ledger).
- [ ] **Step 3: Update docs:** `HANDOFF.md` — раздел «Desktop slice 2a» (что делает worker, где данные, ограничения: BBB-адаптер распознаёт только `connected`, нет повторного входа после падения worker) и ручной чек-лист Windows (реальный импорт, тестовая лекция, «Остановить» из трея, сон/пробуждение, выход во время лекции); убрать устаревшее «несмапившиеся → no-op».
- [ ] **Step 4: Run** `npm test && npm run build && npx --no-install openspec validate desktop-lectures --strict && npx --no-install prettier --check <изменённые файлы>` — Expected: PASS; `npm run lint` не выше базы `main` (57).
- [ ] **Step 5: Commit** `test(desktop): cover lecture attendance end to end`
