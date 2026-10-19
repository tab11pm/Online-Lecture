# Windows-упаковка — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Подготовить проверяемый Windows x64 NSIS-установщик существующего Online Lecture без системных Node.js/npm у пользователя.

**Architecture:** Код приложения остаётся в ASAR, production-граф распаковывается, отдельная Electron-native SQLite поставляется ресурсом. Main передаёт worker доверенный режим выполнения; packaged-режим не читает `.env`, включая bundled MCP. Проверка реального распакованного пакета предшествует созданию NSIS, а Windows-приёмка ведётся отдельно от Linux-гейтов.

**Tech Stack:** TypeScript, Electron, electron-builder 26, NSIS, Vitest, Playwright, better-sqlite3, установленный `@electron/asar`.

**Spec:** `docs/superpowers/specs/2026-10-19-windows-packaging-design.md`, `openspec/changes/windows-packaging/specs/windows-packaging/spec.md`.

**Execution:** План согласован пользователем. По его решению реализация передаётся DeepSeek; Luna не запускается. Изменения и результаты проверок могут быть переданы Codex на последующее ревью. Реализация пока не начата.

## Global Constraints

- Windows x64, per-user NSIS, без повышения прав; `appId=ru.onlinelecture.desktop`, продукт `Online Lecture`, exe `OnlineLecture.exe`.
- Edge по умолчанию на Windows. Chromium не включается в установщик и скачивается только кнопкой; существующие правила `chromium-choice-install` не меняются.
- Код в `resources/app.asar`; production-зависимости в `resources/app.asar.unpacked/node_modules`; SQLite в `resources/native/better_sqlite3.node`.
- Версии зависимостей берутся из текущего lockfile; electron-builder остаётся major 26. Node-native SQLite общего workspace не пересобирается упаковщиком.
- Packaged-политика определяется `app.isPackaged`, не переменной окружения. Dev `.env` и CLI продолжают работать как раньше; публичный renderer IPC, схема данных и расписание не меняются.
- Packaged main и bundled MCP не загружают `.env`. Дочерние CLI запускаются без shell через Electron Node.
- Пользовательские базы, сессии, профили, логи, `.env`, архивы и скачанные браузеры в пакет не входят. LICENSE/NOTICE зависимостей сохраняются.
- Uninstall/обновление сохраняют `%LOCALAPPDATA%/OnlineLecture` и общий кэш Playwright; uninstaller убирает только собственные ярлыки и регистрацию автозапуска.
- Подпись, публичный релиз, публикация и автообновления не входят в этап. Все builder-команды используют `--publish never`.
- Production-код и новые scripts пишутся на TypeScript. Конфигурация builder — YAML, NSIS-макрос — `.nsh`; `scripts/**/*.ts` добавляются в desktop node typecheck.
- Каждая задача: наблюдаемый red → минимальная реализация → целевые тесты, `npm test` и `npm run build` перед завершением/коммитом. Если sandbox мешает локальным child-process тестам, контроллер повторяет с разрешением, не ослабляя тесты.
- Успешная сборка на Linux не закрывает Windows E2E. Реальные SSO/BBB и загрузка браузера не запускаются автоматически; никакие секреты не нужны для сборки.

## Review Focus

1. Подложный `.env`, dotenv-опции и server-path в окружении не должны подменять packaged MCP или создавать непро́токольный stdout — Task 1.
2. Путь с пробелами/кириллицей вне репозитория, без `NODE_PATH` и developer Node в PATH, не должен ломать распакованные зависимости — Tasks 3, 5.
3. Linux ELF, неверный PE, устаревший stamp или подложенный после сборки `.node` должны отклоняться до NSIS — Tasks 3, 4.
4. Повторный запуск до готовности окна и запуск из `--hidden` не должны создавать второе окно/worker — Tasks 2, 5.
5. Update/uninstall не должны удалять данные или чужие registry-значения; собственный autostart не должен оставлять мёртвый exe — Tasks 4, 5.

## Карта файлов и зависимости задач

Task 1 вводит runtime-policy, worker startup codec и packaged MCP-конфигурацию. Task 2 добавляет identity/single-instance и точное имя autostart. Task 3 вводит native/package validators и production manifest. Task 4 связывает их в Windows builder-команды и NSIS include. Task 5 проверяет получившийся exe и документирует Windows smoke. Task 4 зависит от Tasks 1–3; Task 5 — от Task 4. Даже независимые части выполняются последовательно, чтобы не конфликтовать в main/manifest.

### Task 1: Packaged runtime без `.env`

**Files:** Create `apps/desktop/src/shared/runtime-mode.ts`, `apps/desktop/src/shared/worker-startup.ts`, `apps/desktop/src/main/runtime-policy.ts`, `apps/desktop/src/worker/desktop-mcp-config.ts`; modify `apps/desktop/src/main/{index,core-process,load-env}.ts`, `apps/desktop/src/worker/entry.ts`; tests `apps/desktop/tests/shared/worker-startup.test.ts`, `apps/desktop/tests/main/{runtime-policy,core-process,load-env}.test.ts`, `apps/desktop/tests/worker/desktop-mcp-config.test.ts`. Core CLI `src/config/mcp-config.ts` не менять ради desktop-only политики.

**Interfaces:**

- `RuntimeMode = 'development' | 'packaged'`.
- `WorkerStartupOptions { userDataDir: string; externalChannel?: string; runtimeMode: RuntimeMode }`; `encodeWorkerStartup(options): string[]`, `decodeWorkerStartup(args: readonly string[]): WorkerStartupOptions`. Сохраняются первые три существующих аргумента, четвёртый — mode; отсутствующий mode означает development, некорректный отклоняется. Worker передаёт `process.argv.slice(2)`.
- `CoreProcessOptions.runtimeMode?: RuntimeMode`, default development; main всегда передаёт режим из `app.isPackaged`.
- `initializeRuntimeEnvironment(input: { isPackaged: boolean; appPath: string; resourcesPath: string; cwd: string; platform: NodeJS.Platform }, env: NodeJS.ProcessEnv): RuntimeMode`. В dev использует существующий env-loader, в packaged не читает env-файлы и принудительно задаёт SQLite по resourcesPath, игнорируя внешний `ONLINE_LECTURE_SQLITE_BINDING`. Browser defaults здесь не выставляются: существующий `applyDesktopServerDefaults` вызывается только после чтения settings. Иначе default `msedge` ошибочно превратится в пользовательское внешнее переопределение.
- `loadDesktopMcpConfig(input: { runtimeMode: RuntimeMode; platform: NodeJS.Platform }, deps?: { env?: NodeJS.ProcessEnv; execPath?: string; resolveBundled?: () => string | undefined; loadDevelopment?: () => McpConfig }): McpConfig`. В dev вызывает существующий `loadMcpConfig`. В packaged требует bundled entry, задаёт `source='bundled'`, fixed args `[script]`, cwd каталога script и Electron Node. Env формируется через существующий безопасный allowlist, а dotenv-параметры принудительно задаются последними. Нет fallback на PATH/пользовательский MCP или внешние server-path/cwd/args в packaged.

- [ ] **Step 1: Write failing tests.** Литеральные ожидания: dev `/app/native/better_sqlite3.node`, packaged `/resources/native/better_sqlite3.node`; hostile `ONLINE_LECTURE_SQLITE_BINDING=/wrong` действует только в dev. Проверить codec с `C:\Users\Студент Имя\Online Lecture`, внешним channel `''`, неизвестным mode и двойным запуском worker после restart. Проверить, что sentinel из временного `.env` появляется только в dev. Packaged MCP использует заданный Electron exe/entry, `ELECTRON_RUN_AS_NODE='1'`, `DOTENV_CONFIG_PATH='NUL'` для win32 и `/dev/null` для Linux, quiet true/debug false, независимо от hostile dotenv/server-path env; отсутствие bundled entry даёт понятную ошибку без fallback.
- [ ] **Step 2: Run red.** `npm test -w @online-lecture/desktop -- runtime-policy worker-startup desktop-mcp-config core-process load-env`. Ожидание: новые тесты FAIL на отсутствующих интерфейсах/поведении, прежние не изменены под ложный pass.
- [ ] **Step 3: Implement interfaces and integration.** Вызвать policy до запуска worker и чтения внешнего channel; заменить positional-разбор на codec. Внешний channel захватывается только в development после env-loader, но до browser defaults; в packaged выбор определяет сохранённая настройка/UI. Добавить регрессию: старт с сохранённым Chromium на Windows не превращает Edge default в override. Не менять fake clock и real/fake provider selection. Не удалять dev-env поддержку.
- [ ] **Step 4: Add executable dotenv regression.** Временный cwd с `.env` содержит только `PACKAGING_SENTINEL=unexpected`. Запустить текущий Node с `-r <реальный dotenv/config из зависимости SDO MCP>` и фиксированным JS-выражением, печатающим JSON sentinel. С policy env stdout должен быть ровно `{}` плюс перевод строки, exit 0; с dev preload sentinel виден. Никаких credentials и обращений к СДО. Выполнить red без защиты, затем green с policy; не патчить node_modules.
- [ ] **Step 5: Verify and commit.** Целевой запуск, `npm test`, `npm run build` — PASS. Коммит `fix(desktop): isolate packaged runtime configuration`.

### Task 2: Windows identity и единственный процесс

**Files:** Create `apps/desktop/src/shared/application-identity.ts`, `apps/desktop/src/main/application-instance.ts`; modify `apps/desktop/src/main/{index,autostart}.ts`; tests `apps/desktop/tests/main/{application-instance,autostart}.test.ts`.

**Interfaces:** `APPLICATION_ID='ru.onlinelecture.desktop'`, `PRODUCT_NAME='Online Lecture'`, `EXECUTABLE_NAME='OnlineLecture.exe'`, `AUTOSTART_ENTRY_NAME='Online Lecture'`. `startApplicationInstance(input: { app: InstanceApp; platform: NodeJS.Platform; onOpen: () => void; startPrimary: (markReady: () => void) => void }): void`; `InstanceApp` — узкая структурная форма `requestSingleInstanceLock`, `quit`, `on('second-instance', listener)`, `setAppUserModelId`. Helper сам вызывает `startPrimary` только после успешного lock; main передаёт существующий startup с `app.whenReady`. `markReady` сообщает, что главное окно уже создано обычным startup-путём. Autostart использует существующий `setAutostart` с явным `name: AUTOSTART_ENTRY_NAME`; чтение результата остаётся платформенным.

- [ ] **Step 1: Write failing tests.** Отказ lock вызывает quit и не вызывает переданный `startPrimary`; успешный lock на Windows задаёт appId до вызова `startPrimary`. Два `second-instance` до ready не вызывают `onOpen` и не повторяют startup; `markReady()` вызывает `onOpen` один раз. После ready повторный запуск открывает окно, повторный `markReady()` ничего не дублирует. Linux не вызывает Windows-only appId. Autostart false пишет только собственное имя, args `['--hidden']`, возвращает прочитанное значение; true тоже не меняет чужие записи. Проверка реального второго exe/worker остаётся в Task 5.
- [ ] **Step 2: Run red.** `npm test -w @online-lecture/desktop -- application-instance autostart` — новые тесты FAIL.
- [ ] **Step 3: Implement.** Guard main выполняется до `core.start`; только primary регистрирует основной startup. Вторичные open-запросы до готовности откладываются, а не создают конкурирующее окно. После штатного создания окна вызвать `markReady`. Существующий graceful quit, hide-to-tray и поведение `--hidden` сохраняются.
- [ ] **Step 4: Verify and commit.** Целевые тесты, `npm test`, `npm run build` — PASS. Коммит `fix(desktop): enforce Windows application identity and single instance`.

### Task 3: Production-зависимости и проверяемый состав пакета

**Files:** Modify `apps/desktop/package.json`, `package-lock.json`, `apps/desktop/tsconfig.node.json`; create `apps/desktop/scripts/{native-build-check,packaged-app-check}.ts`; tests `apps/desktop/tests/packaging/{native-build-check,packaged-app-check}.test.ts`. Existing `apps/desktop/scripts/build-native-sqlite.mjs` остаётся источником отдельного native output/stamp.

**Interfaces:**

- `assertWindowsNativeBuild(input: { binaryPath: string; stampPath: string; electronVersion: string; sqliteVersion: string; platform: NodeJS.Platform; arch: string }): Promise<void>`. Проверяет существование, stamp, DOS/PE signatures, bounds PE offset и `Machine=0x8664`; platform win32/arch x64 обязательны.
- `verifyPackagedApplication(input: { packageDir: string; expectedNativeSha256: string }): Promise<{ checkedFiles: number }>`. Читает реальный ASAR через `@electron/asar`, дерево рядом и native bytes. Требует exe, main/worker/preload/renderer entry, распакованные runtime manifests/entries, native PE и совпадение SHA с ранее проверенным binary. Проверяет рекурсивный production-граф зависимостей desktop по реально поставленным manifests, включая nested dependencies SDO MCP; отсутствующий узел — ошибка. Проверяет запреты ниже, не выводя содержимое найденных приватных файлов.
- Desktop production dependencies: добавить `better-sqlite3` с текущим root range и перенести текущий `jsdom` из dev; без обновления разрешённых lockfile версий. `@electron/asar` добавить как прямую desktop devDependency в уже установленной версии `3.4.1`; не полагаться на transitive tool. Добавить `scripts/**/*.ts` в node typecheck.

- [ ] **Step 1: Write failing native tests.** Таблица: валидный PE x64/current stamp → resolve; ELF, PE arm64/ia32, truncated buffer/offset вне файла, отсутствующий binary/stamp, неверные platform/arch или версии → reject. Реальные временные файлы, синтетический PE только как fixture, не заменяющий загрузку настоящего модуля.
- [ ] **Step 2: Write failing package tests.** Создать маленький реальный ASAR fixture + unpacked tree. Missing worker, missing nested dotenv, Node-native build в better-sqlite3/build, чужой SHA, `.env`, auth state, profile/log/data/diagnostics в собственных ресурсах → reject. LICENSE/NOTICE и служебный SQL сторонней библиотеки допускаются. Проверить дерево в каталоге `Студент Имя` и запрет выноса ссылок dependency-графа за packageDir. Fixtures не содержат настоящих секретов.
- [ ] **Step 3: Run red.** `npm test -w @online-lecture/desktop -- tests/packaging` — новые проверки FAIL.
- [ ] **Step 4: Implement.** Сканировать и ASAR listing, и распакованные файлы; для production resolution использовать поставленные manifests/package roots, не require из исходного workspace. Path traversal/symlink за packageDir отклонять. При ошибке сообщать безопасный относительный путь/код, не содержимое. Lockfile обновить минимально штатным npm, проверить отсутствие нецелевых upgrade и сохранение git pin SDO MCP.
- [ ] **Step 5: Verify and commit.** Целевые тесты, `npm test`, `npm run build` — PASS. Повторить core SQLite-тесты после изменения manifest: workspace Node binding не повреждён. Коммит `build(desktop): validate native runtime and packaged contents`.

### Task 4: Windows pack/dist и NSIS

**Files:** Create `apps/desktop/electron-builder.yml`, `apps/desktop/build/installer.nsh`, `apps/desktop/scripts/package-windows.ts`; modify `apps/desktop/package.json`; tests `apps/desktop/tests/packaging/package-windows.test.ts`; docs `apps/desktop/README.md`.

**Interfaces:** `runWindowsPackaging(input: { target: 'dir' | 'nsis'; desktopDir: string }, deps: { platform: NodeJS.Platform; arch: string; run: (command: string, args: readonly string[], cwd: string) => Promise<void> }): Promise<void>`. CLI wrapper выбирает только `--dir`/`--nsis`, остальные входы отклоняет. Использует Task 3 validators. Прямые команды: `pack:win = tsx --tsconfig tsconfig.node.json scripts/package-windows.ts --dir`, `dist:win = tsx --tsconfig tsconfig.node.json scripts/package-windows.ts --nsis`. Использовать существующий root `tsx` как developer tool; packaged runtime его не требует. Другие TS scripts с desktop alias запускаются с тем же tsconfig.

Builder config: identity из Global Constraints, app directory — desktop; output `dist`; `asar: true`, `asarUnpack: ['node_modules/**/*']`, `npmRebuild: false`. Собственный allowlist `out/**` и manifest; исключить source maps, preview, tests и все приватные ресурсы из design; runtime LICENSE/NOTICE сохранить. Исключить `node_modules/better-sqlite3/build/**`. `extraResources` копирует только `native/better_sqlite3.node` в `native/better_sqlite3.node`. `win.target=nsis`, x64, `executableName=OnlineLecture`; `artifactName=OnlineLecture-Setup-${version}-${arch}.${ext}`; `nsis.oneClick=false`, `perMachine=false`, `allowElevation=false`, `deleteAppDataOnUninstall=false`, include `build/installer.nsh`. Никаких custom data/cache deletion macros.

- [ ] **Step 1: Write failing orchestration tests.** Fake runner записывает реальные команды оркестратора: Linux/arm64 отклоняются до builder; ошибка build/native/check останавливает цепочку. `dir` не запускает NSIS; `nsis` использует уже проверенный `win-unpacked` через `--prepackaged`, все builder вызовы содержат `--publish never`. Проверить cwd-independent абсолютные пути, путь с пробелами и ненулевые exits. Синтетические файлы fixtures нужны для реальных validator calls, а не mock-success проверки безопасности.
- [ ] **Step 2: Run red.** `npm test -w @online-lecture/desktop -- package-windows` — FAIL на новом orchestration behavior.
- [ ] **Step 3: Implement build chain.** До любых build-действий проверить host win32/x64. Из корня выполнить `scripts/check-playwright-versions.mjs` текущим developer Node, затем desktop build (включая отдельный native build), Task 3 native check и SHA. Запустить локальный builder `--win --x64 --dir --publish never` с явным config. Проверить созданный `dist/win-unpacked` Task 3 validator. Только после успеха для nsis вызвать builder `--win nsis --x64 --prepackaged <win-unpacked> --publish never`; записать SHA-256 ровно `OnlineLecture-Setup-<manifest version>-x64.exe` в соседний `.sha256`, не искать первый exe широким glob. Не удалять весь dist или чужие данные при ошибке; незавершённый выпуск не объявлять успешным.
- [ ] **Step 4: Implement uninstall include.** `customUnInstall` удаляет ровно `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` value `Online Lecture` из Task 2. Не удалять ключ Run целиком, другие значения, userData или browser cache. Использовать штатную проверку запущенного приложения NSIS; фактическое поведение остановки/uninstall проверяется Task 5 на Windows, не выдавать чтение macro за этот тест.
- [ ] **Step 5: Verify and commit.** Целевые тесты, `npm test`, `npm run build` — PASS. На Windows выполнить `npm run pack:win -w @online-lecture/desktop`, проверить actual contents, затем `npm run dist:win -w @online-lecture/desktop` и SHA. На Linux запуск Windows-команды должен дать понятный отказ, а не сборку с Linux native. Обновить README требованиями developer build и предупреждением о неподписанном тестовом exe. Коммит `build(desktop): add per-user Windows installer`.

### Task 5: Packaged E2E и честная Windows-приёмка

**Files:** Modify `apps/desktop/tests/e2e/support/electron-app.ts`; create `apps/desktop/tests/e2e/packaged-runtime.test.ts`, `apps/desktop/tests/packaging/packaged-runtime.test.ts`, `apps/desktop/scripts/packaged-runtime-smoke.ts`, `docs/windows-smoke.md`; update `docs/HANDOFF.md`, `apps/desktop/README.md`, `openspec/changes/windows-packaging/tasks.md`.

**Interfaces:** Дополнительная переменная тестового harness `ONLINE_LECTURE_PACKAGED_EXECUTABLE=<absolute path to OnlineLecture.exe>`. Без неё существующие четыре dev E2E работают как прежде. С ней helper передаёт Playwright `executablePath`, не передаёт desktopRoot как аргумент, не требует dev mainEntry и запрещает не-Windows host. В обоих режимах временные profile/LOCALAPPDATA и fake-session обязательны. Packaged subprocess запускается из временного cwd вне репозитория; `NODE_PATH`, `NODE_OPTIONS`, унаследованный `ELECTRON_RUN_AS_NODE` и developer CLI paths не используются для разрешения runtime-зависимостей.

`smokePackagedRuntime(input: { executablePath: string; packageDir: string; cwd: string }): Promise<void>` запускает дочерние процессы самим packaged Electron с `ELECTRON_RUN_AS_NODE=1`: загрузка `better-sqlite3` с resources/native и открытие/закрытие временной базы; распакованный Playwright CLI `--version`; MCP `initialize`/handshake через SDK без вызова browser tools. Результат содержит только коды/версии, не дамп окружения. Все дочерние процессы имеют ограниченный timeout и закрываются в finally; cleanup касается только созданных этим smoke временных каталогов.

- [ ] **Step 1: Write failing tests.** Проверить выбор dev/packaged launch, запрет Linux для exe-ветки, отсутствие dev-root требования, обязательную изоляцию и fail вместо skip при явном opt-in. Runtime fixtures моделируют отсутствующий nested module, неверный binding и зависший child; smoke должен reject и закрыть процессы. Sentinel `.env` в cwd не должен попадать в MCP stdout/окружение; безопасный handshake не должен запускать браузер.
- [ ] **Step 2: Run red.** Целевые helper/smoke unit-тесты разместить в `apps/desktop/tests/packaging/packaged-runtime.test.ts`; `npm test -w @online-lecture/desktop -- tests/packaging/packaged-runtime.test.ts` — FAIL. Native cases в e2e остаются opt-in и не выполняются как unit.
- [ ] **Step 3: Implement harness and smoke.** Повторно использовать существующие четыре UI-сценария, а не копировать селекторы. Включённый packaged E2E требует явный exe path и реальные ресурсы; no-op или fallback на dev Electron не допускается. Перед GUI smoke проверить `app.isPackaged === true` через Electron API. Для контролируемого child runtime ограничить PATH и убрать NODE_PATH: успех не должен зависеть от репозитория/developer Node. MCP handshake закрывается до любого browser tool; CLI `--version` не скачивает браузеры.
- [ ] **Step 4: Run available gates.** `npm test`, `npm run build`, desktop production build, ESLint/Prettier изменённых файлов и `git diff --check` — PASS. Доступный dev Electron-прогон: `CI_ELECTRON_E2E=1 npm test -w @online-lecture/desktop -- tests/e2e` (без packaged exe); Windows packaged-прогон — та же команда с явным `ONLINE_LECTURE_PACKAGED_EXECUTABLE`. Если Windows недоступна, не подставлять Wine/Linux вместо Windows-гейта и не отмечать следующий шаг выполненным.
- [ ] **Step 5: Execute Windows acceptance.** На чистой разрешённой Windows VM без developer Node/npm/repo проверить: инсталляция без UAC; fake UI/E2E и реальный bundled CLI/MCP-handshake/native module; Edge default; явное скачивание Chromium кнопкой, ошибка/повтор и единые browser options; DPAPI отказ при недоступности; трей/уведомление/переход в журнал; `--hidden` и второй exe не создают worker; явный autostart. Перед update/uninstall сохранить fixture-настройки/историю и добавить постороннее тестовое Run-значение: после операций данные/кэш и постороннее значение сохранены, собственный autostart/ярлыки удалены. Завершить активную fake-лекцию и проверить отсутствие процессов worker/browser. Проверить переустановку. Скачивание требует отдельного явного запуска оператора, реальный SSO/BBB сюда не входит. Записать конкретные результаты/непроверенные пункты в `docs/windows-smoke.md`.
- [ ] **Step 6: Handoff and commit.** Отметить только фактически выполненные OpenSpec задачи и Windows-пункты; при отсутствии Windows отдельно указать «реализация готова к Windows-проверке», не «установщик проверен». Упомянуть неподписанный статус, SHA и отсутствие публикации. Коммит `test(desktop): verify packaged runtime and document Windows acceptance` после доступных гейтов; незакрытая Windows-приёмка остаётся видимой.

## Self-review

Coverage: runtime/env — Task 1; appId/single-instance/autostart — Task 2; зависимости, native ABI stamp/PE и actual package inventory — Task 3; NSIS/команды/no-publish/checksum/uninstall — Task 4; реальный packaged runtime и разделение Linux/Windows/SSO приёмки — Task 5. Все пять Review Focus привязаны к тестам или явной Windows-проверке. Codec/runtime mode, native resource path, identity и autostart-name согласованы между производителями и потребителями. План не разрешает публикацию, системные изменения машины пользователя или запуск реальной лекции.
