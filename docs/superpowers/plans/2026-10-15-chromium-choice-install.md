# Выбор и установка Chromium — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Пользователь Windows выбирает Chromium и устанавливает его кнопкой в приложении; новые браузерные операции используют выбранный браузер.

**Architecture:** Настройка хранится в main и передаётся worker типизированной командой. Отдельный сервис main проверяет и устанавливает бинарник Playwright; адаптеры ядра получают канал браузера явно. Renderer получает состояние и ход установки через узкий IPC.

В текущем десктопе импорт и запуск BBB ещё не подключены к UI; план добавляет явные опции в их адаптеры и проверяет их тестами. Перед подключением этих операций к десктопу выбор из настроек нужно передать в соответствующие вызовы.

**Tech Stack:** TypeScript, Electron 44, React 19, Playwright, Vitest, OpenSpec.

**Spec:** `docs/superpowers/specs/2026-10-15-chromium-choice-install-design.md`, `openspec/changes/chromium-choice-install/specs/browser-choice-install/spec.md`.

## Global Constraints

- Выбор: `edge | chromium`; Windows по умолчанию использует Edge, остальные платформы — Chromium.
- Установка только после действия пользователя, без системных Node.js/npm/npx и без shell.
- Явный `SDO_BROWSER_CHANNEL`, включая пустую строку, имеет приоритет для SDO MCP и показывается в UI.
- Сохранённый выбор Chromium применяется только после подтверждения наличия бинарника текущей версии Playwright.
- CLI остаётся независимым от настроек десктопа; секреты и URL лекций не попадают в сообщения установки.

## Review Focus

- Chromium удалён после выбора: перед входом показывается установка, а импорт/BBB возвращают явную ошибку отсутствующего браузера (Tasks 1, 3).
- Два нажатия «Установить»: работает один процесс; оба вызова получают один результат (Task 2).
- CLI завершается с кодом 0, но бинарника нет: установка считается ошибкой (Task 2).
- Повреждённое значение в `settings.json`: безопасный выбор по умолчанию (Task 1).
- Внешний `SDO_BROWSER_CHANNEL=''`: MCP использует его, UI сообщает о переопределении (Tasks 1, 4).

---

## Карта файлов

- `apps/desktop/src/shared/browser-choice.ts`: тип выбора и IPC-состояние установки.
- `src/core/browser-launch.ts`: проверка Chromium и понятная ошибка для операций ядра.
- `apps/desktop/src/main/settings-store.ts`: сохранение выбора.
- `apps/desktop/src/main/chromium-installer.ts`: проверка бинарника, один процесс установки, статус и очистка ошибок.
- `apps/desktop/src/main/index.ts`, `ipc.ts`, `preload/index.ts`, `shared/ipc-contract.ts`: узкий IPC и передача выбора worker.
- `apps/desktop/src/worker/core-host.ts`, `sdo-mcp-session-provider.ts`, `shared/host-protocol.ts`, `main/core-process.ts`: применение выбора к новым запускам MCP.
- `src/timetable/playwright-fetcher.ts`, `src/core/bbb-session.ts`: явные опции канала для импорта и BBB.
- `apps/desktop/src/renderer/src/components/BrowserChoice.tsx`, `CredentialsForm.tsx`, `SessionReady.tsx`, `App.tsx`: выбор и установка на обоих экранах.
- Параллельные тесты в `apps/desktop/tests/{main,worker,renderer}/` и `tests/{core,timetable}/`.

### Task 1: Настройка и адаптеры Playwright

**Files:** `apps/desktop/src/shared/browser-choice.ts`, `apps/desktop/src/main/settings-store.ts`, `src/core/browser-launch.ts`, `src/core/bbb-session.ts`, `src/timetable/playwright-fetcher.ts`; соответствующие существующие тесты.

**Interfaces:** Produces `type BrowserChoice = 'edge' | 'chromium'`, `type BrowserInstallState = { status: 'available' | 'missing' | 'installing' | 'error'; message?: string }`, `browserChannel(choice: BrowserChoice): 'msedge' | undefined`, `AppSettings.browser?: BrowserChoice`, `assertBrowserAvailable(channel?: 'msedge'): Promise<void>`; `PlaywrightFetcherOptions.channel?: 'msedge'`; `new PlaywrightBbbSessionManager({ channel?: 'msedge' } = {})`. `SessionConfig.headless` остаётся прежним.

- [ ] Написать тесты: неверный `settings.browser` отбрасывается; сохранённое значение читается; `browserChannel('edge') === 'msedge'`; импортер и BBB передают `channel: 'msedge'` при выборе Edge и не задают канал для Chromium; отсутствие Chromium вызывает понятную ошибку до запуска браузера.
- [ ] Выполнить `npx --no-install vitest run tests/timetable/playwright-fetcher.test.ts tests/core/bbb-session.test.ts tests/core/browser-launch.test.ts` и `npm test -w @online-lecture/desktop -- settings-store`, убедиться в падении новых тестов.
- [ ] Реализовать тип, сохранение и явные опции запуска без изменения стандартного поведения CLI.
- [ ] Повторить те же команды и `npm run build`; ожидать PASS.
- [ ] Commit: `feat: add browser choice to settings and Playwright adapters`.

### Task 2: Сервис установки Chromium

**Files:** создать `apps/desktop/src/main/chromium-installer.ts`, тест `apps/desktop/tests/main/chromium-installer.test.ts`.

**Interfaces:** Produces `ChromiumInstaller.getState(): Promise<BrowserInstallState>` и `ChromiumInstaller.install(): Promise<BrowserInstallState>`; `BrowserInstallState` из Task 1. Конструктор принимает узкие зависимости для проверки `chromium.executablePath()`, запуска дочернего процесса и публикации статуса. CLI ищется через `playwright/package.json` + `cli.js`; путь `app.asar` заменяется на `app.asar.unpacked`.

- [ ] Написать тесты: бинарник найден/отсутствует; запуск `process.execPath` с фиксированными `install chromium`, `ELECTRON_RUN_AS_NODE=1`, `shell: false`; два вызова делят одну установку; ошибка процесса; код 0 без бинарника; редактирование текста ошибки; путь через `app.asar`.
- [ ] Выполнить `npm test -w @online-lecture/desktop -- chromium-installer`, убедиться в падении.
- [ ] Реализовать сервис и публиковать статусы без паролей, cookies и URL лекций; не обещать процент, если Playwright его не выдаёт.
- [ ] Повторить тест и `npm run build`; ожидать PASS.
- [ ] Commit: `feat(desktop): install Playwright Chromium on demand`.

### Task 3: IPC выбора, установки и проверки перед входом

**Files:** `apps/desktop/src/shared/ipc-contract.ts`, `shared/host-protocol.ts`, `main/ipc.ts`, `main/index.ts`, `main/core-process.ts`, `preload/index.ts`, `worker/core-host.ts`, `worker/sdo-mcp-session-provider.ts`; соответствующие тесты main/worker.

**Interfaces:** Produces `DesktopApi.app.getBrowser(): Promise<BrowserView>`, `setBrowser(choice: BrowserChoice): Promise<BrowserView>`, `installChromium(): Promise<BrowserView>`, `onBrowserChanged(listener): () => void`; `BrowserView = { choice: BrowserChoice; install: BrowserInstallState; externalChannel?: string }`. Worker command `browser.setChoice` carries `BrowserChoice`; `SdoMcpSessionProvider.setBrowserChoice(choice): void` changes env for future clients. Explicit `SDO_BROWSER_CHANNEL` from initial environment wins.

- [ ] Написать тесты: Windows default Edge; stored Chromium passed to worker before session check; selecting missing Chromium leaves stored choice unchanged; installation success saves Chromium; missing saved Chromium blocks login with install guidance; explicit empty env wins; live worker receives new choice without interrupting current operation; IPC redacts errors.
- [ ] Выполнить `npm test -w @online-lecture/desktop -- ipc core-process core-host sdo-mcp-session-provider load-env`, убедиться в падении.
- [ ] Реализовать контракты и основной поток. Снимок внешнего env берётся до применения Windows default; новые вызовы MCP читают актуальный выбор.
- [ ] Повторить тесты и `npm run build`; ожидать PASS.
- [ ] Commit: `feat(desktop): connect browser choice and installer over IPC`.

### Task 4: Экран выбора и документация

**Files:** создать `apps/desktop/src/renderer/src/components/BrowserChoice.tsx`; изменить `App.tsx`, `CredentialsForm.tsx`, `SessionReady.tsx`; тест `apps/desktop/tests/renderer/onboarding.test.tsx`; обновить `docs/HANDOFF.md`.

**Interfaces:** Consumes `DesktopApi.app` из Task 3. Экран показывает выбор, загрузку, ошибку и повтор на экранах входа и активной сессии. CLI оставляет канал адаптеров `undefined`.

- [ ] Написать тесты UI: выбор Chromium без бинарника показывает кнопку; загрузка блокирует второе нажатие; успех сохраняет выбор; ошибка показывает повтор; экран после входа позволяет сменить выбор; внешнее переопределение показано. Убедиться, что существующие CLI-тесты не меняются.
- [ ] Выполнить `npm test -w @online-lecture/desktop -- onboarding`, убедиться в падении новых тестов.
- [ ] Реализовать UI; описать в `docs/HANDOFF.md` ручную Windows-проверку и команду для разработки `npx playwright install chromium`.
- [ ] Выполнить `npm test`, `npm run build`, `npx --no-install prettier --check` для изменённых файлов, `openspec validate chromium-choice-install --strict`; ожидать PASS.
- [ ] Commit: `feat(desktop): offer Chromium install in onboarding`.

## Проверка на Windows при упаковке

Упаковка Electron ещё не реализована в репозитории. При её добавлении включить CLI Playwright и зависимости в `app.asar.unpacked`, проверить установку Chromium на чистой Windows без Node.js и прохождение входа, импорта и тестовой лекции. До этой проверки не считать сценарий установленного приложения подтверждённым.
