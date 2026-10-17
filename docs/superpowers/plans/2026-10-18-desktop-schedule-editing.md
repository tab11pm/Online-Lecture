# Редактирование расписания в десктопе — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Пользователь меняет время импортированной пары, переносит её и добавляет разовую или еженедельную ручную лекцию из окна Windows-приложения.

**Architecture:** Чистые правила в `src/core` работают с существующими `Job` и `ImportedOccurrence`; репозиторий SQLite атомарно проверяет запуск и записывает все затронутые задания. Worker разрешает BBB-цель через MCP, хранит URL за непрозрачным ID и публикует безопасную повестку. Main/preload передают типизированные запросы с результатом, React показывает формы и состояния.

**Tech Stack:** TypeScript, better-sqlite3, Luxon, SDO MCP, Electron, React, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-18-desktop-schedule-editing-design.md`, `openspec/changes/desktop-schedule-editing/specs/desktop-schedule-editing/spec.md`.

## Global Constraints

- Импортированные правки сохраняют `edited`; перенос подавляет исходное вхождение и создаёт связанную `once` в одной транзакции.
- Изменять можно только будущие вхождения без начатого запуска; `joinAt < leaveAt`, обе отметки в одном дне, зона `Asia/Krasnoyarsk` явно показана.
- Ручная пара после подтверждения BBB-активности имеет `source: 'manual'`; отсутствие `source` у старых заданий означает ручную пару.
- Полный и частичный импорт сохраняют пользовательские правки и ручные пары; одинаковые дата, время и дисциплина дают один запуск.
- Снимок UI и результаты поиска не содержат внутренних URL BBB, join-URL, cookies и токенов; введённую ссылку не писать в лог.
- Сохранять работу CLI и существующего планировщика; сеть и реальный ТУСУР использовать только в разрешённом ручном smoke.

## Review Focus

- Два одинаковых клика «Перенести» → одна связанная пара, источник скрыт один раз (Task 2).
- Импорт записывает результат после ручной правки, начатой во время сетевого поиска → правка остаётся (Task 2).
- Worker завершился между запросом UI и ответом → Promise отклоняется, форма не показывает ложное сохранение (Task 5).
- Старая/подменённая ID BBB-кандидата → пара не сохраняется, URL не раскрывается (Task 3).
- Ручное название совпало с другой дисциплиной по времени → подавляется только соответствующая импортированная пара (Tasks 1–2).

---

## Карта файлов

- `src/core/schedule-editing.ts` — проверка формы и чистые преобразования заданий.
- `src/core/types.ts`, `lecture-agenda.ts`, `src/timetable/import-merger.ts` — безопасные поля названия/связи и корректная повестка/дедупликация.
- `src/persistence/job-repository.ts` — атомарная правка, перенос, отмена, создание/удаление и merge импорта с проверкой таблицы `runs`.
- `apps/desktop/src/worker/manual-targets.ts` и `lecture-adapters.ts` — поиск через MCP и временное соответствие ID ↔ URL.
- `apps/desktop/src/worker/lecture-service.ts`, `core-host.ts` — операции, обновление снимка, внеочередной тик.
- `apps/desktop/src/shared/{lectures,host-protocol,ipc-contract}.ts`, `apps/desktop/src/main/{core-process,index,ipc}.ts`, `apps/desktop/src/preload/index.ts` — типизированный обмен с ответом.
- `apps/desktop/src/renderer/src/components/{AgendaList,MainScreen,ScheduleEditor,ManualLectureWizard}.tsx` — пользовательские действия; текущая структура главного окна сохраняется.

### Task 1: Правила расписания и повестка

**Files:** `src/core/types.ts`, создать `src/core/schedule-editing.ts`, изменить `src/core/lecture-agenda.ts`, `src/timetable/import-merger.ts`; тесты `tests/core/schedule-editing.test.ts`, `tests/core/lecture-agenda.test.ts`, `tests/timetable/import-merger.test.ts`.

**Interfaces:** Produces `EditImportedTimeInput = { jobId: string; date: string; joinAt: string; leaveAt: string }`, `RescheduleInput = { jobId: string; date: string; newDate: string; newJoinAt: string; newLeaveAt: string }`, `ManualScheduleInput = { type: 'once'; date: string; joinAt: string; leaveAt: string } | { type: 'weekly'; days: Weekday[]; joinAt: string; leaveAt: string }`, `validateManualSchedule(input, now): void`, `editImportedTime(job, input): Job`, `makeRescheduledJob(source, input, id): { source: Job; replacement: Job }`, `Job.title?`, `Job.rescheduledFrom?`.

- [ ] **Step 1: Write failing tests** `edits only one imported date and preserves edited through merge`; `rejects invalid or past intervals and empty weekly days`; `reschedule returns a suppressed source and linked once`; `uses manual title for agenda and exact-discipline dedup` (same time, different title remains active).
- [ ] **Step 2: Run** `npx --no-install vitest run tests/core/schedule-editing.test.ts tests/core/lecture-agenda.test.ts tests/timetable/import-merger.test.ts` — Expected: FAIL on new behavior.
- [ ] **Step 3: Implement** the signatures above. Require one imported occurrence per `(jobId,date)` (current importer invariant), use Luxon in `Asia/Krasnoyarsk`, normalize discipline with trim/case folding, and never treat a new manual `title` as empty wildcard.
- [ ] **Step 4: Run** the same command and `npm run build` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: add schedule editing rules`.

### Task 2: Атомарные операции SQLite и merge импорта

**Files:** `src/persistence/job-repository.ts`, `src/timetable/import-service.ts`; тесты `tests/persistence/job-repository.test.ts`, `tests/timetable/import-service.test.ts`.

**Interfaces:** Consumes Task 1 inputs/rules. Produces `SqliteJobRepository.editImportedTime(input, now): Promise<void>`, `reschedule(input, now): Promise<string>`, `cancelReschedule(replacementJobId, now): Promise<void>`, `saveManual(job, now): Promise<void>`, `deleteManual(jobId): Promise<void>`, `mergeTimetableJobs(importedJobs, prune): Promise<MergeSummary>`. Все методы чтения/проверки/записи работают в одной SQLite `immediate` transaction после `createBackup()`.

- [ ] **Step 1: Write failing tests** `rejects an edit if run is resolving or time has arrived`; `allows an untouched scheduled row without making a second run`; `moves and cancels both jobs atomically`; `repeated move creates no duplicate`; `manual save rejects an identical manual occurrence and immediately suppresses matching imported pair only`; `import merge preserves an edit written after fetch began`; `delete leaves run history`.
- [ ] **Step 2: Run** `npx --no-install vitest run tests/persistence/job-repository.test.ts tests/timetable/import-service.test.ts` — Expected: FAIL on new methods/behavior.
- [ ] **Step 3: Implement** transaction methods and move the `listAll → mergeImportedJobs → replaceTimetableJobs` write phase of `runTimetableImport` into `mergeTimetableJobs`, keeping CLI result shape and partial-import `prune=false` rule. Check active/terminal runs inside the write transaction. Generate `manual:` IDs in the repository, reject duplicate `rescheduledFrom`, and do not delete `runs`.
- [ ] **Step 4: Run** the same command, `npx --no-install vitest run tests/cli tests/timetable`, and `npm run build` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: persist schedule edits atomically`.

### Task 3: Подтверждение BBB-активности без URL в интерфейсе

**Files:** создать `apps/desktop/src/worker/manual-targets.ts`; изменить `apps/desktop/src/worker/lecture-adapters.ts`, `lecture-adapters.fake.ts`, `lecture-service.ts`; тесты `apps/desktop/tests/worker/manual-targets.test.ts`, `lecture-adapters.test.ts`, `lecture-service.test.ts`.

**Interfaces:** Produces `ManualTargetLookup = { status: 'resolved' | 'ambiguous'; candidates: Array<{ id: string; name: string; type: 'lecture' | 'practical'; courseName: string }> } | { status: 'not_found' | 'auth_required' }`; `LectureService.resolveManualTarget(query: string): Promise<ManualTargetLookup>` and `saveManual(input: { candidateId: string; title: string; schedule: ManualScheduleInput }): Promise<void>`. `ManualTargetStore` keeps ID → `{ activityUrl, activityName }` only in worker memory and invalidates the ID only after successful save. Candidate `courseName` comes from resolved course metadata, обычного текстового запроса или безопасного fallback «Курс СДО» для URL-запроса; пользователь может исправить `title` до сохранения.

- [ ] **Step 1: Write failing tests** for `resolved`, `ambiguous`, `not_found`, `auth_required`; unsupported course URL and invalid/stale candidate ID rejected; `saveManual` requires selected candidate and nonempty title; failed save retains the candidate for retry; output serialization contains no course/activity URL, cookie or token; fake adapter returns safe candidates for E2E.
- [ ] **Step 2: Run** `npm test -w @online-lecture/desktop -- manual-targets lecture-adapters lecture-service` — Expected: FAIL.
- [ ] **Step 3: Implement** lookup with `resolveOnlineLecture({ courseUrl })` for allowed course URL or `{ courseQuery }` for text, closing MCP client in `finally`. Map real candidate URLs to `crypto.randomUUID()` IDs in worker memory. Use Task 2 `saveManual` with `source: 'manual'`, user title and direct confirmed activity target; expire/clear drafts after successful save, a new lookup or shutdown.
- [ ] **Step 4: Run** the same command and `npm run build` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop): resolve manual lecture targets`.

### Task 4: Операции редактирования в worker

**Files:** `apps/desktop/src/worker/lecture-service.ts`, `apps/desktop/src/shared/lectures.ts`; тест `apps/desktop/tests/worker/lecture-service.test.ts`.

**Interfaces:** Consumes Tasks 1–3. Produces `LectureService.editImportedTime(input): Promise<void>`, `reschedule(input): Promise<string>`, `cancelReschedule(jobId): Promise<void>`, `deleteLecture(jobId, date?): Promise<void>`; `AgendaItem` adds `source: 'manual' | 'timetable'`, `editable: boolean`, `rescheduledFrom?: { jobId: string; date: string }` and safe title.

- [ ] **Step 1: Write failing tests** `publishes edited agenda after time change`; `publishes hidden source and one linked replacement after move`; `cancels move before run and rejects after run`; `stops an active manual lecture before deleting its job and preserves runs`; `hides only selected imported date`; `tick after save starts a due manual pair once`.
- [ ] **Step 2: Run** `npm test -w @online-lecture/desktop -- lecture-service` — Expected: FAIL.
- [ ] **Step 3: Implement** operations via Task 2 repository methods, derive `editable` from DB run state/time, stop and await an active manual run before deleting its job, publish after commit, and trigger `loop.tick()` after save. Keep URL and target out of `LecturesView`.
- [ ] **Step 4: Run** the same command and `npm run build` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop): expose editable lecture agenda`.

### Task 5: Типизированные ответы IPC

**Files:** `apps/desktop/src/shared/{host-protocol,ipc-contract}.ts`, `apps/desktop/src/worker/core-host.ts`, `apps/desktop/src/main/{core-process,index,ipc}.ts`, `apps/desktop/src/preload/index.ts`; тесты `apps/desktop/tests/{main/core-process,main/ipc,worker/core-host}.test.ts`.

**Interfaces:** Consumes Task 3 `ManualTargetLookup` and Task 4 methods. Produces `DesktopApi.lectures` methods `resolveManualTarget(query): Promise<ManualTargetLookup>`, `saveManual(input): Promise<void>`, `editImportedTime(input): Promise<void>`, `reschedule(input): Promise<string>`, `cancelReschedule(jobId): Promise<void>`, `deleteLecture(jobId,date?): Promise<void>`. `MainCommand` carries `{ requestId: string }` for these calls; `HostEvent` replies `{ type: 'lectures.commandResult'; requestId; ok: true; value?: unknown } | { ..., ok: false; message: string }`.

- [ ] **Step 1: Write failing tests** `resolves a successful worker reply once`; `rejects a redacted worker error`; `rejects all pending calls on worker exit/timeout`; `rejects malformed renderer arguments before dispatch`; `passes only safe candidate fields`; `host rejects edit while session unavailable`.
- [ ] **Step 2: Run** `npm test -w @online-lecture/desktop -- core-process ipc core-host` — Expected: FAIL.
- [ ] **Step 3: Implement** correlation IDs and pending Promise map in `CoreProcess` (120 s lookup timeout, 30 s mutation timeout; clear on exit), typed dispatch in `CoreHost`, narrow runtime validation in main, preload bridge, and redaction at worker/main boundary. Keep existing fire-and-forget commands unchanged.
- [ ] **Step 4: Run** the same command and `npm run build` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop): return schedule command results over IPC`.

### Task 6: Формы расписания

**Files:** создать `apps/desktop/src/renderer/src/components/ScheduleEditor.tsx`, `ManualLectureWizard.tsx`; изменить `AgendaList.tsx`, `MainScreen.tsx`; тесты `apps/desktop/tests/renderer/{main-screen,schedule-editor,manual-lecture-wizard}.test.tsx`.

**Interfaces:** Consumes Task 5 `DesktopApi` and Task 4 `AgendaItem`. Preserves existing `MainScreen`/`AgendaList` structure. Manual form: курс → дата или дни недели → время → выбор BBB-активности → сохранение; `ScheduleEditor` handles time edit/move/cancel.

- [ ] **Step 1: Write failing tests** `adds a once job after explicit activity confirmation`; `requires at least one weekly day`; `shows ambiguous candidates and waits for selection`; `keeps input after not_found and shows re-login for auth_required`; `edits only future imported row`; `move shows source and replacement`; `cancel move restores source`; `deletes a manual job and hides one imported date`; `prevents second submit while pending`; `shows inline field errors and keyboard focus`.
- [ ] **Step 2: Run** `npm test -w @online-lecture/desktop -- main-screen schedule-editor manual-lecture-wizard` — Expected: FAIL.
- [ ] **Step 3: Implement** labeled fields, visible `Asia/Krasnoyarsk`, explicit confirmation and safe error states. Use current component styling and the locked Refero craft rules in the design (focus-visible, labels, inline errors, submit state); compare rendered UI with the interactive review example and correct functional drift.
- [ ] **Step 4: Run** the same command, `npm run build`, and `npx --no-install prettier --check apps/desktop/src/renderer/src/components` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop): add schedule editing forms`.

### Task 7: Сквозная проверка и документация

**Files:** `apps/desktop/tests/e2e/lectures.test.ts`, `docs/HANDOFF.md`, `openspec/changes/desktop-schedule-editing/tasks.md`.

**Interfaces:** Consumes Tasks 1–6; no new runtime API.

- [ ] **Step 1: Write E2E test** with fake session: seed a separate future imported pair in the fake adapter, add a future once pair via fake BBB lookup, see it in agenda, move the future imported pair, cancel move and see original return. Assert no real network request is needed.
- [ ] **Step 2: Run** `npm run build -w @online-lecture/desktop && CI_ELECTRON_E2E=1 npm test -w @online-lecture/desktop -- lectures` — Expected: PASS with display; if display unavailable, record opt-in skip and keep renderer/worker tests green.
- [ ] **Step 3: Update** `HANDOFF.md` with slice 2b behavior, limitations and Windows manual checklist; mark implemented OpenSpec tasks. Run `npm test && npm run build && npm run lint` and `npx --no-install openspec validate desktop-schedule-editing --strict` where the CLI is installed. Expected: tests/build PASS; lint no new findings beyond baseline; OpenSpec validation PASS when available.
- [ ] **Step 4: Commit** `test(desktop): verify schedule editing flow`.
