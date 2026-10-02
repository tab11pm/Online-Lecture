# Handoff — Online Lecture: автоимпорт расписания ТУСУР

Краткий контекст, чтобы продолжать работу без повторного разбора. Обновляй по мере изменений.

## Состояние репозитория

- **Репозиторий:** `/home/tabek/D/tusur/online-lecture` (Node/TypeScript, ESM, vitest, better-sqlite3, Playwright, luxon, zod, commander).
- **HEAD:** ветка `master`; фича «Автоимпорт расписания ТУСУР» слита, поверх — фикс запуска реального MCP и slice 1 Electron-приложения (`apps/desktop`).
- **Рабочее дерево:** чистое, кроме несвязанных `data/lectures.db` (modified) и `data/backups/*.sqlite` (untracked) — их не трогать.
- **Гейты:** `npm run build` чист (core tsc + desktop typecheck) · `npm test` = **172** (28 файлов, core) + **65** desktop (1 E2E пропущен без `CI_ELECTRON_E2E=1`) · `npm run lint` = 58 (baseline был 65; новые/изменённые файлы чистые по prettier) · `prettier --check apps/desktop` и `eslint apps/desktop` чисты.

## Документы (источник истины)

- Дизайн: `docs/superpowers/specs/2026-10-02-timetable-auto-import-design.md`
- План: `docs/superpowers/plans/2026-10-02-timetable-auto-import.md`
- OpenSpec-change: `openspec/changes/timetable-auto-import/`
- Продуктовая спецификация: `SPEC.md` (обновлена)
- Roadmap: `.planning/ROADMAP.md` (фаза «Автоимпорт расписания ТУСУР»)
- Правила репозитория: `AGENTS.md`

## Что сделано (фазы 1–2 дизайна)

Ядро импорта в `src/timetable/`:

- `timetable-parser.ts` — парсер страницы группы; онлайн-пары по пометке **«реализуется в ЭИОС»**; полное имя дисциплины из `abbr[title]`; `ScheduleParseError`, если таблицы расписания нет (пустая неделя → `[]`).
- `course-mapper.ts` — `course_links` → id курса SDO; `buildCourseUrl(id)` → `https://sdo.tusur.ru/course/view.php?id=<id>`.
- `http-fetcher.ts` — порт `HttpFetcher { get(url): Promise<string> }`, принимает **абсолютные** URL.
- `timetable-client.ts` — `discoverGroup` (авторизованная главная → «Мое расписание» → `faculty/group`), недели `?week_id=`, `fetchOnlineLessons`, `fetchCourseLinks`.
- `online-selector.ts` — группировка онлайн-пар по дисциплине/курсу.
- `timetable-importer.ts` — сборка `Job`'ов (id `tt:<faculty>:<group>:<sdoCourseId>`, дедуп дублей id).
- `import-merger.ts` — слияние при обновлении.
- `playwright-fetcher.ts` — адаптер авторизованной выборки по storage state.

Интеграция в ядро/CLI:

- `src/core/types.ts` — `Schedule` с типом `imported`, `Job.source/origin`, `OnlineLectureResolver` и типы результата.
- `src/core/occurrence.ts` — ветка `imported` в `findActiveOccurrence`.
- `src/core/mcp-client.ts` — `resolveOnlineLecture` (метод MCP `sdo/resolveOnlineLecture`).
- `src/persistence/job-repository.ts` — `listAll`/`delete`.
- `src/cli/commands.ts` — команда `import` + `CliDependencies` (инъекция фетчера/резолвера для тестов).

## Desktop-приложение (`apps/desktop`) — slice 1 сделано

Windows-приложение (Electron + React/TS) на локальном ядре. Slice 1 закрывает onboarding и обвязку окна/трея:

- `src/main/` — главный процесс: окно (`window.ts`), трей (`tray.ts`), автозапуск (`autostart.ts`), IPC (`ipc.ts`), `CoreProcess` (utility process), `SecretStore` (DPAPI через `safeStorage` + явный fallback), `SettingsStore`, `paths.ts`.
- `src/preload/index.ts` — узкий typed-мост `window.desktop` (contextIsolation, sandbox: false, без node в renderer).
- `src/renderer/src/` — React UI onboarding (welcome → credentials → authenticating → manual_sso → session_ready / failed).
- `src/worker/` — локальное ядро: `CoreHost`, `OnboardingMachine`, `TusurSessionProvider` (Playwright, ленивая загрузка), `entry.ts`; `session-provider.fake.ts` — in-memory провайдер для E2E.
- `src/shared/` — типизированные IPC-контракт, протокол ядра, onboarding-состояния, `createAppPaths`.

Команды (из корня, workspace):

```bash
npm run dev -w @online-lecture/desktop        # electron-vite dev
npm run build -w @online-lecture/desktop      # сборка в out/
npm run typecheck -w @online-lecture/desktop  # tsc --noEmit (node + web)
npm test -w @online-lecture/desktop           # vitest без GUI
```

E2E (`apps/desktop/tests/e2e/onboarding.test.ts`) — vitest + Playwright `_electron`, поднимает `out/main/index.js` с `ONLINE_LECTURE_FAKE_SESSION=1`, проходит приветствие → форму → «Сессия активна». По умолчанию пропускается; включается `CI_ELECTRON_E2E=1`.

Пути данных (Windows): `%LOCALAPPDATA%/OnlineLecture/` → `data/lectures.db`, `auth.json`, `credentials.enc`, `settings.json`, `logs/`. Ничего из этого в git не попадает.

## Ключевые инварианты (не ломать)

- Группа определяется автоматически по ссылке «Мое расписание»; факультет/группа у пользователя не спрашиваются.
- `lessonId` повторяется между неделями → дедуп по `lessonId + date` (не по одному `lessonId`).
- Merge: ручные пары (`source != 'timetable'`) не изменяются; `edited` сохраняется; `suppressed` не возвращается; удаление (`prune`) только при **полном** импорте.
- При `auth_required` или несмапившихся курсах — no-op: exit 1, БД не меняется.
- Парсер различает «пустая неделя» (`[]`) и «сломанная страница» (исключение).
- Никогда не логировать `sessionToken`, cookies, join-URL; секреты только локально.

## Интеграция с SDO MCP (реальный сервер)

- MCP-сервер (`sdo_mcp`) регистрирует **стандартный инструмент** `resolve_online_lecture` (и `check_sdo_auth`); вызов — `tools/call`, результат — `content: [{ type: 'text', text: '<JSON результата>' }]`.
- Наш `SdoMcpClient.resolveOnlineLecture` (`src/core/mcp-client.ts`) теперь вызывает его через `client.callTool({ name: 'resolve_online_lecture', arguments: input })` и разбирает `content[].text` как JSON. Контракт типов совпадает: `resolved{ course:{id,name,url?}, module:{id,name,courseUrl,activityUrl,type} } | ambiguous{candidates} | not_found | auth_required`.
- Вход в SDO — по storage state (`SDO_AUTH_STATE_PATH`), без пароля; при отсутствии/истечении сессии инструмент возвращает `auth_required`.
- **Методы клиента переведены на реальные инструменты (сделано).** Удалена несуществующая схема `sdo/*`: вместо `authenticate`/`Session` — `checkSdoAuth()` → `check_sdo_auth`; `listCourses()` (без сессии) → `list_courses`; `findCourseModule(courseUrl, query)` → `find_course_module`; `getAssignmentDetails(url)` → `get_assignment_details`. Методы `findBbbActivity`/`getBbbUrl` и типы `Credentials`/`Session`/`BbbActivity`/`BbbUrl` удалены.
- `JobRunner` search-ветка теперь вызывает `resolveOnlineLecture` и явно обрабатывает `auth_required`/`not_found`/`ambiguous`, после резолва закрывает MCP. `credentials` из `runJob` убраны (аутентификация — по storage state).
- Общий разбор ответа вынесен в `callJsonTool`/`readText` (`content[].text` → JSON), поэтому все инструменты используют один контракт.

## Запуск реального MCP-сервера (сделано)

- `loadMcpConfig` (`src/config/mcp-config.ts`) разбирает `SDO_MCP_SERVER_PATH` как **командную строку** (`splitCommandLine`: executable + args, поддержка кавычек); читает `SDO_MCP_SERVER_CWD`; `MCP_TIMEOUT_MS` как fallback для `SDO_MCP_CONNECTION_TIMEOUT`.
- `collectServerEnv` форвардит серверу только нужные переменные: `SDO_*`, `MCP_*`, `BBB_*`, `TUSUR_*`, `HEADLESS` плюс GUI-переменные (`DISPLAY`, `WAYLAND_DISPLAY`, `XDG_*`, `XAUTHORITY`, `DBUS_SESSION_BUS_ADDRESS`).
- `StdioClientTransport` получает `args`/`cwd`/`env` (раньше всегда `args: []` и дефолтное окружение).
- `src/cli/index.ts` грузит `.env` через `process.loadEnvFile('.env')` (отсутствие файла — ок); шаблон — `.env.example`.
- `playwright-fetcher.ts` при `content-type: application/json` возвращает сырое тело ответа, а не обёртку JSON-viewer'а Chromium (нужно для `course_links`).

## Что ещё НЕ сделано

1. **Slice 2 Electron:** список лекций/правки/«Перенести» в UI, уведомления/журнал, интеграция импорта в приложение.
2. **Фаза 4:** Windows-упаковка одним установщиком (electron-builder) и реальная проверка на Windows.
3. **Windows-верификация (вручную):** реальный SSO-вход, DPAPI-шифрование пароля, автозапуск через реестр, поведение трея — см. чек-лист ниже; в песочнице проверялось только с фиктивным провайдером.
4. **Живой smoke:** парсинг можно проверить с `auth.json`; полный импорт с созданием заданий требует установленного `sdo_mcp` и `SDO_MCP_SERVER_PATH`, а также session storage state в `SDO_AUTH_STATE_PATH`.

## Как проверить на Windows

```powershell
npm install
npx playwright install chromium
npm run build
npm test

# desktop: сборка и запуск
npm run build -w @online-lecture/desktop
npm run dev -w @online-lecture/desktop

# desktop E2E с фиктивной сессией (без реального SSO):
npm run build -w @online-lecture/desktop
$env:CI_ELECTRON_E2E="1"; npm test -w @online-lecture/desktop -- onboarding

# реальный парсинг расписания:
npx playwright codegen --save-storage=./auth.json https://timetable.tusur.ru/   # войти и закрыть окно
npm run cli -- import --db ./data/lectures.db --auth-state ./auth.json
npm run cli -- jobs list --db ./data/lectures.db

# полный импорт с резолвом BBB (нужен собранный sdo_mcp):
$env:SDO_MCP_SERVER_PATH="C:\path\to\sdo-mcp"
$env:SDO_AUTH_STATE_PATH="C:\path\to\auth.json"   # MCP читает сессию отсюда
npm run cli -- import --db ./data/lectures.db --auth-state ./auth.json
```

`--auth-state` нужен нашему timetable-фетчеру; `SDO_AUTH_STATE_PATH` — самому MCP-серверу (та же сессия).

### Ручной чек-лист desktop (Windows)

- [ ] Реальный SSO: вход по логину/паролю создаёт `%LOCALAPPDATA%/OnlineLecture/auth.json`; при капче/2FA открывается видимое окно SSO.
- [ ] DPAPI: `credentials.enc` расшифровывается на этой же учётке; при переносе на другую машину пароль не читается (ожидаемо).
- [ ] Автозапуск: переключатель в UI меняет запись автозапуска и `settings.json`.
- [ ] Трей: закрытие окна сворачивает в трей, «Выход» завершает процесс и ядро.
- [ ] Данные лежат вне репозитория (`%LOCALAPPDATA%/OnlineLecture/`), секреты не попадают в логи.

Тестовый живой пример группы: `fvs/574-1`; онлайн-пары — РМП2 (SDO id `22413`) и РВП (`22414`).

## Оговорки

- Slice 1 desktop готов и покрыт UI/логическими тестами; реальный SSO, DPAPI, автозапуск и трей требуют ручной проверки на Windows (см. чек-лист).
- Baseline `lint`/`format:check` грязный по всему репозиторию; новые файлы оцениваются по дельте и должны быть чистыми.
- `data/lectures.db` и бэкапы в git — давняя проблема гигиены, не связана с фичей.
