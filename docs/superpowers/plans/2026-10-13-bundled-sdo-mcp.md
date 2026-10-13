# Bundled SDO MCP and Launch Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** online-lecture запускает SDO MCP из установленного пакета `sdo_mcp` через Node из Electron, а при неудачном запуске показывает понятную причину и пишет подробности в журнал без секретов.

**Architecture:** Ядро (`src/config`, `src/core`) выбирает команду сервера по источникам `env > bundled > user-install > path`, применяет таймаут рукопожатия и превращает сбои подключения в типизированную `SdoMcpUnavailableError` с хвостом stderr. Десктоп-worker пробрасывает эту ошибку в `OnboardingMachine`, который переводит онбординг в фазу `failed` с текстом по причине, и пишет события в `logs/core.log`.

**Tech Stack:** TypeScript (ESM, NodeNext), `@modelcontextprotocol/sdk` `StdioClientTransport`, Electron utility process, vitest.

**Spec:** `docs/superpowers/specs/2026-10-13-bundled-sdo-mcp-design.md`, `openspec/changes/bundle-sdo-mcp/specs/sdo-mcp-runtime/spec.md`

## Global Constraints

- Порядок источников команды: `SDO_MCP_SERVER_PATH` > пакет `sdo_mcp` > `~/.local/bin/sdo-mcp` > `sdo-mcp` из PATH.
- Для источника `bundled`: команда `process.execPath`, args `[<script>]`, в окружении сервера `ELECTRON_RUN_AS_NODE=1`; путь через `app.asar` заменяется на `app.asar.unpacked`.
- Причины недоступности — ровно `not_found`, `exited`, `timeout`.
- Хвост stderr — не больше 4096 символов, всегда после `redactSensitiveText`.
- Тексты (точно):
  - `not_found`: `Компонент входа SDO MCP не найден. Переустановите приложение.`
  - `exited`/`timeout`: `Компонент входа SDO MCP не запустился. Подробности в журнале: <путь к core.log>.`
- Журнал: `<AppPaths.logs>/core.log`, ротация в `core.log.1` при размере больше 1 МБ (1 048 576 байт); окружение сервера не журналируется; сбой записи не бросает исключение.
- Десктоп на Windows задаёт `SDO_BROWSER_CHANNEL=msedge`, только если переменная не определена (пустая строка — осознанный выбор пользователя, её не трогать).
- Ошибки инструментов (`isError` в ответе) не считаются недоступностью сервера.
- Стиль: 2 пробела, `kebab-case` файлы, тесты именуются по наблюдаемому поведению. Коммиты `feat:`/`fix:`/`refactor:` с trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Проверки после каждой задачи: `npm test` и `npm run build` из корня.

## Review Focus

1. Холодный старт sdo_mcp на Windows (антивирус, первый запуск Electron) дольше таймаута → ложный `timeout`. Ожидание: сервер, ответивший до истечения `connectionTimeout`, подключается. Тест — в Task 3 (`connects to a server that answers before the timeout`).
2. Путь к пакету с пробелами или кириллицей (`C:\Users\Иван Петров\...`) → скрипт передаётся одним аргументом, не режется. Тест — в Task 2.
3. sdo_mcp пишет в stderr cookie, токен или URL с `sessionToken` → в `detail` и в журнале только редактированный текст. Тест — в Task 3.
4. Пользователь сам задал `SDO_BROWSER_CHANNEL`, в том числе пустую строку, чтобы отключить Edge → значение не перезаписывается. Тест — в Task 5.
5. Каталога `logs/` нет или он недоступен для записи → журнал создаёт каталог при первой записи, а при ошибке молчит. Тест — в Task 5.

---

### Task 1: Удалить неиспользуемые методы `SdoMcpClient`

Инструменты `list_courses`, `find_course_module`, `get_assignment_details` удаляются из sdo_mcp; у нас их методы нигде не вызываются.

**Files:**

- Modify: `src/core/mcp-client.ts` (удалить `listCourses`, `findCourseModule`, `getAssignmentDetails`, `RawCourse`, `courseIdFromUrl`)
- Modify: `src/core/types.ts` (удалить `CourseModuleMatch`, `CourseModuleMatches`; `Course` остаётся — его использует `OnlineLectureResolution`)
- Modify: `src/core/index.ts` (убрать удалённые типы из экспорта)
- Modify: `tests/core/mcp-client.test.ts` (удалить блоки `listCourses`, `findCourseModule`, `getAssignmentDetails`)
- Modify: `tests/integration/sdo-mcp-bbb.test.ts` (удалить 3 соответствующих `it`, обновить doc-комментарий со списком инструментов: `check_sdo_auth`, `sdo_login`, `resolve_online_lecture`)
- Modify: `tests/core/bbb-orchestrator.test.ts` (убрать `listCourses` из фейка, если он перестал соответствовать типу)

**Interfaces:**

- Produces: `SdoMcpClient` с публичными методами только `checkSdoAuth`, `login`, `resolveOnlineLecture`, `close`.

- [ ] **Step 1: Удалить методы, типы и их тесты**
- [ ] **Step 2: Проверить, что ссылок не осталось**

Run: `grep -rnE "listCourses|findCourseModule|getAssignmentDetails|CourseModuleMatch" src apps/desktop/src tests apps/desktop/tests`
Expected: пусто.

- [ ] **Step 3: `npm test && npm run build`** — Expected: всё проходит.
- [ ] **Step 4: Commit** — `refactor(core): drop SDO MCP client methods for removed tools`

---

### Task 2: Выбор источника команды сервера

**Files:**

- Modify: `src/core/types.ts` (тип источника, поле в `McpConfig`)
- Modify: `src/config/mcp-config.ts`
- Test: `tests/config/mcp-config.test.ts`

**Interfaces:**

- Produces:
  - `type McpServerSource = 'env' | 'bundled' | 'user-install' | 'path'` в `src/core/types.ts`, экспорт из `src/core/index.ts`;
  - `McpConfig.source?: McpServerSource`;
  - `resolveBundledServer(resolve?: (id: string) => string, exists?: (path: string) => boolean): string | undefined` — абсолютный путь к скрипту или `undefined`;
  - `loadMcpConfig(deps?: { resolveBundled?: () => string | undefined; defaultCommand?: () => string }): McpConfig`;
  - существующий `defaultServerCommand(home?, exists?)` остаётся.

- [ ] **Step 1: Написать падающие тесты `resolveBundledServer`**

```ts
describe('resolveBundledServer', () => {
  it('returns the resolved entry point of the installed package', () => {
    const script = join('/repo', 'node_modules', 'sdo_mcp', 'dist', 'index.js');
    expect(
      resolveBundledServer(
        () => script,
        () => true,
      ),
    ).toBe(script);
  });
  it('returns undefined when the package is not installed', () => {
    expect(
      resolveBundledServer(
        () => {
          throw new Error('MODULE_NOT_FOUND');
        },
        () => true,
      ),
    ).toBeUndefined();
  });
  it('returns undefined when the entry point file is missing', () => {
    expect(
      resolveBundledServer(
        () => '/repo/node_modules/sdo_mcp/dist/index.js',
        () => false,
      ),
    ).toBeUndefined();
  });
  it('maps a path inside app.asar to app.asar.unpacked', () => {
    const packed = join(
      'C:',
      'App',
      'resources',
      'app.asar',
      'node_modules',
      'sdo_mcp',
      'dist',
      'index.js',
    );
    const unpacked = join(
      'C:',
      'App',
      'resources',
      'app.asar.unpacked',
      'node_modules',
      'sdo_mcp',
      'dist',
      'index.js',
    );
    expect(
      resolveBundledServer(
        () => packed,
        (p) => p === unpacked,
      ),
    ).toBe(unpacked);
  });
});
```

- [ ] **Step 2: Написать падающие тесты порядка источников**

Тесты сохраняют и восстанавливают `SDO_MCP_SERVER_PATH` (`try/finally`).

- `uses SDO_MCP_SERVER_PATH even when the package is installed` → `source: 'env'`, команда из строки.
- `runs the installed package through process.execPath` → `serverPath === process.execPath`, `args` равен `[script]`, `env.ELECTRON_RUN_AS_NODE === '1'`, `source: 'bundled'`.
- `keeps a package path with spaces and Cyrillic as a single argument` → script `C:\Users\Иван Петров\app\node_modules\sdo_mcp\dist\index.js` даёт `args` длины 1, равный ему.
- `falls back to the user install, then to sdo-mcp on PATH` → с `resolveBundled: () => undefined` и `defaultCommand: () => 'sdo-mcp'` получаем `source: 'path'`; с `defaultCommand`, возвращающим путь, — `source: 'user-install'`.

- [ ] **Step 3: Run** `npx vitest run tests/config/mcp-config.test.ts` — Expected: FAIL (функции и поля не существуют).
- [ ] **Step 4: Реализовать**

`resolveBundledServer` по умолчанию использует `createRequire(import.meta.url).resolve('sdo_mcp')` (поле `main` пакета указывает на `dist/index.js`) и `existsSync`. Замена asar — по сегменту пути `app.asar` между разделителями, без затрагивания `app.asar.unpacked`. В `loadMcpConfig` `ELECTRON_RUN_AS_NODE` добавляется к результату `collectServerEnv()` только для `bundled`. Источник `user-install` определяется тем, что `defaultCommand()` вернул не `'sdo-mcp'`.

- [ ] **Step 5: Run** `npx vitest run tests/config` — Expected: PASS.
- [ ] **Step 6: `npm test && npm run build`**, затем commit — `feat(core): run the installed sdo_mcp package through process.execPath`

---

### Task 3: Таймаут рукопожатия и `SdoMcpUnavailableError`

**Files:**

- Create: `src/core/mcp-errors.ts`
- Modify: `src/core/mcp-client.ts` (`ensureConnected`)
- Modify: `src/core/index.ts` (экспорт ошибки)
- Create: `tests/fixtures/mcp/exit-with-stderr.mjs` — пишет в stderr `starting\ncookie: session=abc123 https://sdo.tusur.ru/?sessionToken=xyz` и завершается с кодом 3
- Create: `tests/fixtures/mcp/silent.mjs` — ничего не отвечает, держит процесс `setInterval`
- Create: `tests/fixtures/mcp/slow-ok.mjs` — через 300 мс поднимает настоящий `McpServer` из `@modelcontextprotocol/sdk` на stdio без инструментов
- Test: `tests/core/mcp-client-connection.test.ts`

**Interfaces:**

- Consumes: `McpConfig.source` (Task 2).
- Produces:
  - `type SdoMcpUnavailableReason = 'not_found' | 'exited' | 'timeout'`;
  - `class SdoMcpUnavailableError extends Error`, конструктор `(reason: SdoMcpUnavailableReason, source: McpServerSource | undefined, detail: string)`, поля `readonly reason`, `readonly source`, `readonly detail` — `name = 'SdoMcpUnavailableError'`, `message = \`SDO MCP unavailable: ${reason}\``;
  - `isSdoMcpUnavailableError(error: unknown): error is SdoMcpUnavailableError` (проверка по `name`, чтобы работать через границу бандла worker);
  - `appendTail(tail: string, chunk: string, max = 4096): string` — сохраняет последние `max` символов.

- [ ] **Step 1: Написать падающие тесты** (фикстуры запускаются как `serverPath: process.execPath, args: [fixturePath]`)

- `reports not_found when the server executable does not exist` → `serverPath: '/nonexistent/sdo-mcp'`, `client.checkSdoAuth()` отклоняется с `reason: 'not_found'`, `source` из конфига.
- `reports exited with a redacted stderr tail when the server dies` → `reason: 'exited'`; `detail` содержит `starting` и код выхода `3`, не содержит `abc123` и `xyz`.
- `reports timeout and closes the transport when the handshake stalls` → `connectionTimeout: 500`, фикстура `silent.mjs`; `reason: 'timeout'`; повторный вызов снова пытается подключиться (а не висит на старом транспорте).
- `connects to a server that answers before the timeout` → `slow-ok.mjs`, `connectionTimeout: 2000`; `client['ensureConnected']()` резолвится.
- `keeps tool errors as plain errors` → в существующем стиле с подменой `callTool`, `isError: true` → ошибка не `SdoMcpUnavailableError`.
- `appendTail keeps only the last characters` → `appendTail('a'.repeat(4096), 'bc')` имеет длину 4096 и оканчивается на `bc`.

- [ ] **Step 2: Run** `npx vitest run tests/core/mcp-client-connection.test.ts` — Expected: FAIL.
- [ ] **Step 3: Реализовать в `ensureConnected`**

Транспорт создаётся с `stderr: 'pipe'`; поток `transport.stderr` читается через `appendTail` до вызова `connect`. `connect` гонится с таймером `connectionTimeout ?? 5000`. Классификация: ошибка с `code` `ENOENT` или `EACCES` → `not_found`; сработавший таймер → `timeout`; остальное → `exited`. `detail` = `exit code <n>` (из события `onclose`/процесса, если доступно) + `\n` + `redactSensitiveText(tail)`. При любой ошибке подключения закрыть транспорт и сбросить `this.client`/`this.transport` в `null`, затем бросить `SdoMcpUnavailableError`.

- [ ] **Step 4: Run** `npx vitest run tests/core` — Expected: PASS.
- [ ] **Step 5: `npm test && npm run build`**, затем commit — `feat(core): classify SDO MCP launch failures and enforce the handshake timeout`

---

### Task 4: Онбординг сообщает о недоступности SDO MCP

**Files:**

- Modify: `apps/desktop/src/worker/sdo-mcp-session-provider.ts` (`runLogin` пробрасывает `SdoMcpUnavailableError`, остальные ошибки — как сейчас)
- Modify: `apps/desktop/src/worker/onboarding-machine.ts`
- Test: `apps/desktop/tests/worker/sdo-mcp-session-provider.test.ts`, `apps/desktop/tests/worker/onboarding-machine.test.ts`

**Interfaces:**

- Consumes: `SdoMcpUnavailableError`, `isSdoMcpUnavailableError` из `@core/core/mcp-errors.js` (Task 3).
- Produces:
  - `OnboardingDependencies` получает необязательные `logPath?: string` и `onError?(error: unknown): void`;
  - `unavailableMessage(error: SdoMcpUnavailableError, logPath: string | undefined): string` — экспорт из `onboarding-machine.ts`.

- [ ] **Step 1: Написать падающие тесты**

Provider:

- `rethrows SDO MCP unavailability from login instead of mapping it to an outcome` → `login` отклоняется `new SdoMcpUnavailableError('not_found', 'path', '')` → `loginWithCredentials` отклоняется той же ошибкой.

Machine (для каждого из `checkSession`, `submitCredentials`, `openManualSso`):

- `shows the not-found message when SDO MCP is missing` → состояние `{ phase: 'failed', message: 'Компонент входа SDO MCP не найден. Переустановите приложение.' }`.
- `shows the not-started message with the log path` → `reason: 'timeout'`, `logPath: 'C:\\logs\\core.log'` → `message === 'Компонент входа SDO MCP не запустился. Подробности в журнале: C:\\logs\\core.log.'`.
- `reports every caught error to onError` → `onError` вызван с исходной ошибкой и для недоступности, и для обычной ошибки.
- `keeps the credentials form for other check failures` → существующий тест с `MCP error -32000` по-прежнему даёт `credentials` с ошибкой.

- [ ] **Step 2: Run** `cd apps/desktop && npx vitest run tests/worker` — Expected: FAIL.
- [ ] **Step 3: Реализовать**

Без `logPath` текст для `exited`/`timeout` заканчивается на `Подробности в журнале приложения.` `busy` по-прежнему сбрасывается в `finally`.

- [ ] **Step 4: Run** `cd apps/desktop && npx vitest run` — Expected: PASS.
- [ ] **Step 5: `npm test && npm run build`**, затем commit — `feat(desktop): explain SDO MCP launch failures in onboarding`

---

### Task 5: Журнал ядра и настройки запуска в десктопе

**Files:**

- Create: `apps/desktop/src/worker/core-log.ts`
- Test: `apps/desktop/tests/worker/core-log.test.ts`
- Modify: `apps/desktop/src/worker/core-host.ts` (`CoreHostDependencies.log?: CoreLog`; передаёт `logPath` и `onError` в машину; в `onError` пишет `reason`, `source`, `detail` для `SdoMcpUnavailableError` и `redactSensitiveText(message)` для остальных)
- Modify: `apps/desktop/src/worker/entry.ts` (создаёт журнал и provider с `loadMcpConfig()`, при старте пишет `sdo-mcp source=<source> command=<serverPath> <args>`)
- Modify: `apps/desktop/src/main/load-env.ts` + `apps/desktop/src/main/index.ts` (канал браузера)
- Test: `apps/desktop/tests/main/load-env.test.ts`, `apps/desktop/tests/worker/core-host.test.ts`

**Interfaces:**

- Consumes: `isSdoMcpUnavailableError` (Task 3), `OnboardingDependencies.logPath/onError` (Task 4), `McpConfig.source` (Task 2).
- Produces:
  - `interface CoreLog { info(message: string): void; error(message: string): void; readonly path: string }`;
  - `createCoreLog(filePath: string, maxBytes = 1_048_576): CoreLog`;
  - `applyDesktopServerDefaults(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): void` в `load-env.ts`.

- [ ] **Step 1: Написать падающие тесты `core-log`** (во временном каталоге)

- `appends timestamped lines` → строка совпадает с `/^\d{4}-\d{2}-\d{2}T.+ INFO hello$/`.
- `redacts secrets before writing` → `error('cookie: session=abc https://x/?token=xyz')` → в файле нет `abc` и `xyz`.
- `rotates to core.log.1 past the size limit` → `maxBytes: 100`, запись 3 строк по 60 символов → `core.log.1` существует, `core.log` меньше 100 байт.
- `creates the logs directory on first write` → путь в несуществующем подкаталоге.
- `never throws when the file cannot be written` → путь, где родитель — обычный файл; `info` не бросает.

- [ ] **Step 2: Написать падающие тесты `applyDesktopServerDefaults`**

- `sets msedge on Windows when the channel is not defined` → `{}` + `'win32'` → `SDO_BROWSER_CHANNEL === 'msedge'`.
- `keeps a user-defined channel, including an empty one` → `{ SDO_BROWSER_CHANNEL: '' }` остаётся `''`; `'chrome'` остаётся `'chrome'`.
- `does nothing outside Windows` → `'linux'` → ключ не определён.

- [ ] **Step 3: Написать падающий тест CoreHost**

- `logs SDO MCP unavailability with reason and source` → фейковый `CoreLog`, машина с `checkSession`, отклоняющимся `SdoMcpUnavailableError('exited', 'bundled', 'exit code 1')` → `log.error` вызван со строкой, содержащей `exited`, `bundled`, `exit code 1`.

- [ ] **Step 4: Run** `cd apps/desktop && npx vitest run tests/worker tests/main` — Expected: FAIL.
- [ ] **Step 5: Реализовать**

`createCoreLog` — синхронные `mkdirSync({ recursive: true })`, `statSync`, `renameSync`, `appendFileSync` в `try/catch`. Каждое сообщение проходит `redactSensitiveText`. В `main/index.ts` вызвать `applyDesktopServerDefaults(process.env, process.platform)` сразу после `loadEnvFiles` и до запуска worker. `entry.ts` при `ONLINE_LECTURE_FAKE_SESSION=1` не пишет строку про источник.

- [ ] **Step 6: Run** `cd apps/desktop && npx vitest run` — Expected: PASS.
- [ ] **Step 7: `npm test && npm run build`**, затем commit — `feat(desktop): add core log and default Edge browser channel on Windows`

---

### Task 6: Документация и OpenSpec tasks

**Files:**

- Modify: `AGENTS.md` (раздел Environment Variables: порядок источников, `SDO_BROWSER_CHANNEL`, `ELECTRON_RUN_AS_NODE` выставляется автоматически)
- Modify: `.env.example` (комментарий к `SDO_MCP_SERVER_PATH` — порядок источников; `SDO_BROWSER_CHANNEL=` с пояснением)
- Modify: `apps/desktop/README.md` (откуда берётся sdo_mcp, где журнал)
- Modify: `openspec/changes/bundle-sdo-mcp/tasks.md` (отметить выполненные пункты)

- [ ] **Step 1: Обновить документы**
- [ ] **Step 2: Run** `npx prettier --check AGENTS.md apps/desktop/README.md openspec/changes/bundle-sdo-mcp && openspec validate bundle-sdo-mcp` — Expected: без замечаний, `is valid`.
- [ ] **Step 3: Commit** — `docs: describe bundled SDO MCP, browser channel and core log`

---

### Task 7: Подключить `sdo_mcp@v1.2.0` (после выпуска тега)

Блокируется тегом `v1.2.0` в `tab11pm/sdo-mcp`. Проверка: `git ls-remote --tags https://github.com/tab11pm/sdo-mcp v1.2.0` возвращает строку.

**Files:**

- Modify: `package.json`, `apps/desktop/package.json` — `"sdo_mcp": "github:tab11pm/sdo-mcp#v1.2.0"` в `dependencies`
- Modify: `package-lock.json` (только через `npm install`)

- [ ] **Step 1: Run** `npm install sdo_mcp@github:tab11pm/sdo-mcp#v1.2.0 && npm install -w @online-lecture/desktop sdo_mcp@github:tab11pm/sdo-mcp#v1.2.0`
- [ ] **Step 2: Проверить установку**

Run: `ls node_modules/sdo_mcp/dist/index.js && node -e "import('node:module').then(m=>console.log(m.createRequire(process.cwd()+'/').resolve('sdo_mcp')))"`
Expected: файл есть, путь оканчивается на `sdo_mcp/dist/index.js`.

- [ ] **Step 3: Smoke** — без `SDO_MCP_SERVER_PATH` в окружении и `.env`: `npm run dev -w @online-lecture/desktop`, «Начать» → в `core.log` строка `source=bundled`, онбординг доходит до формы входа или `session_ready` (а не `failed`).
- [ ] **Step 4: `npm test && npm run build`**, затем commit — `feat: depend on sdo_mcp v1.2.0`
