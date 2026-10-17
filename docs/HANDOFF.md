# Handoff — Online Lecture: автоимпорт расписания ТУСУР

## Desktop slice 2b: редактирование расписания (2026-10-18)

Ветка `feat/desktop-schedule-editing` добавляет правку времени отдельной будущей импортированной пары, перенос с отменой, разовую и еженедельную ручную пару и удаление/скрытие. Правки импорта и перенос записываются атомарно с резервной копией SQLite. Обновление расписания сохраняет `edited`, `suppressed` и ручные задания. Дубликат ручной пары подавляет совпадающее импортированное вхождение.

Мастер ручной пары принимает название курса или ссылку `https://sdo.tusur.ru/course/view.php?id=…`, вызывает MCP-поиск и требует выбор BBB-активности. URL активности хранится в worker за временным ID; в renderer уходят только безопасные названия, тип и ID. После сохранения ID недействителен. В повестке показываются источник, доступные действия и связь переноса. Команды редактирования отвечают через IPC с ID запроса; при выходе worker и таймауте вызовы завершаются ошибкой.

Проверено: `npm test` (312 core, 245 desktop до добавления E2E; два E2E opt-in пропущены), `npm run build`, целевые тесты renderer и worker. `CI_ELECTRON_E2E=1 npm test -w @online-lecture/desktop -- lectures` компилируется, но на этой машине Electron не запускается: при установке с `--ignore-scripts` не появился бинарник. Нужно повторить E2E после установки Electron на машине с доступной загрузкой и дисплеем.

Ручная проверка на Windows:

- [ ] Войти в разрешённую тестовую сессию, добавить разовую и еженедельную пару после явного выбора BBB-активности; убедиться, что адрес и токены не показаны в UI/логах.
- [ ] Изменить время будущей импортированной пары, обновить расписание и проверить сохранение изменения.
- [ ] Перенести будущую пару, убедиться в одной скрытой исходной и одной связанной ручной; отменить перенос до запуска.
- [ ] Скрыть одно импортированное вхождение, удалить ручную пару и проверить, что история запусков осталась.
- [ ] Проверить ошибки `not_found`, `ambiguous`, `auth_required` и восстановление после перезапуска worker.

Следом: Windows-упаковка, уведомления/журнал, живая проверка BBB-состояний и ручная Windows-верификация.

## Выбор браузера и установка Chromium (2026-10-15)

Десктопный онбординг и экран активной сессии предлагают Edge или Chromium. На Windows Edge остаётся вариантом по умолчанию. Если основной Chromium или его headless shell отсутствует, кнопка «Установить Chromium» запускает CLI из зависимостей приложения через Node, встроенный в Electron; системные npm и Node.js пользователю не нужны. После успешной установки выбор сохраняется в `settings.json` и передаётся SDO MCP. Явный `SDO_BROWSER_CHANNEL`, включая пустое значение, остаётся приоритетным и обозначается в интерфейсе. Сборка сверяет версии Playwright у ядра, десктопа и SDO MCP.

Адаптеры импорта и BBB принимают канал браузера явно и до запуска сообщают об отсутствующем Chromium. Их вызовы пока существуют только в CLI; перед подключением импорта и BBB к десктопу туда нужно передать сохранённый выбор. Для разработки остаётся команда `npx playwright install chromium`.

Проверка на чистой Windows при упаковке: выбрать Chromium, скачать кнопкой без установленного Node.js, выполнить SDO-вход, импорт и тестовую лекцию. Упаковка должна располагать CLI Playwright и его зависимости вне `app.asar`; сам Chromium в установщик не включается. Эта ручная проверка ещё не выполнена.

Краткий контекст, чтобы продолжать работу без повторного разбора. Обновляй по мере изменений.

## Состояние репозитория

- **Репозиторий:** `/home/tabek/D/tusur/online-lecture` (Node/TypeScript, ESM, vitest, better-sqlite3, Playwright, luxon, zod, commander).
- **HEAD:** ветка `master`; фича «Автоимпорт расписания ТУСУР» слита, поверх — фикс запуска реального MCP, slice 1 (onboarding) и slice 2a (автопосещение лекций) Electron-приложения (`apps/desktop`).
- **Рабочее дерево:** чистое, кроме несвязанных `data/lectures.db` (modified) и `data/backups/*.sqlite` (untracked) — их не трогать.
- **Гейты:** `npm run build` чист (core tsc + desktop typecheck) · `npm test` = **299** (40 файлов, core) + **205** desktop (2 E2E пропущены без `CI_ELECTRON_E2E=1`) · `npm run lint` = 57 (как baseline `main`; новые/изменённые файлы чистые) · `prettier --check apps/desktop` и `eslint apps/desktop` чисты.

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

## Desktop slice 2a (автопосещение)

**Что делает worker (процесс ядра).** `LectureService` собирает импорт и планировщик. `SchedulerLoop` тикает сразу при активации, затем каждые 30 с, и запускает лекции из `JobRunner`; одновременно идёт только одна лекция. `ImportScheduler` запускает импорт расписания: после входа, при старте (если последний старше 24 ч), раз в сутки и по кнопке; во время лекции импорт откладывается, после ошибки повтор не чаще раза в час. Из окна и трея доступны «Остановить» (abort жизненного цикла, итог `manual`), «Пропустить» и «Вернуть» для вхождения. UI получает целиковый снимок (`LecturesView`) без URL и секретов.

**Где данные.** `%LOCALAPPDATA%/OnlineLecture/data/lectures.db`; время последнего успешного импорта лежит в таблице `meta` под ключом `timetable.lastImportAt`.

**Ограничения.**

- BBB-адаптер распознаёт только состояние `connected`; waiting-room, конец встречи и удаление модератором появятся после фикстур реальных страниц.
- После падения worker во время лекции то же вхождение повторно не запускается.
- При истечении сессии уже стоящие в очереди лекции завершатся ошибкой авторизации.

**Ручной чек-лист (Windows).**

- [ ] Реальный импорт: после входа появляются онлайн-пары группы, в списке полные названия дисциплин.
- [ ] Тестовая лекция: пара, начинающаяся в ближайшие минуты, подключается сама, статус «подключено».
- [ ] «Остановить» из трея завершает лекцию с причиной «остановлено вручную».
- [ ] Сон/пробуждение: после пробуждения планировщик продолжает работу, идущая лекция не дублируется.
- [ ] Выход из приложения во время лекции корректно закрывает браузер и запуск.

E2E `apps/desktop/tests/e2e/lectures.test.ts` (фиктивная сессия, `CI_ELECTRON_E2E=1`) требует дисплея; на машине без X/Wayland он пропускается.

## Ключевые инварианты (не ломать)

- Группа определяется автоматически по ссылке «Мое расписание»; факультет/группа у пользователя не спрашиваются.
- `lessonId` повторяется между неделями → дедуп по `lessonId + date` (не по одному `lessonId`).
- Merge: ручные пары (`source != 'timetable'`) не изменяются; `edited` сохраняется; `suppressed` не возвращается; удаление (`prune`) только при **полном** импорте.
- Частичный импорт (часть курсов не смапилась) сохраняет найденное и ничего не удаляет; `auth_required` и ошибки не меняют БД; `prune` — только при полном импорте.
- Парсер различает «пустая неделя» (`[]`) и «сломанная страница» (исключение).
- Никогда не логировать `sessionToken`, cookies, join-URL; секреты только локально.

## Интеграция с SDO MCP (реальный сервер)

- MCP-сервер (`sdo_mcp`) регистрирует **стандартный инструмент** `resolve_online_lecture` (и `check_sdo_auth`); вызов — `tools/call`, результат — `content: [{ type: 'text', text: '<JSON результата>' }]`.
- Наш `SdoMcpClient.resolveOnlineLecture` (`src/core/mcp-client.ts`) теперь вызывает его через `client.callTool({ name: 'resolve_online_lecture', arguments: input })` и разбирает `content[].text` как JSON. Контракт типов совпадает: `resolved{ course:{id,name,url?}, module:{id,name,courseUrl,activityUrl,type} } | ambiguous{candidates} | not_found | auth_required`.
- Вход в SDO — по storage state (`SDO_AUTH_STATE_PATH`), без пароля; при отсутствии/истечении сессии инструмент возвращает `auth_required`.
- **Методы клиента переведены на реальные инструменты (сделано).** Удалена несуществующая схема `sdo/*`: вместо `authenticate`/`Session` — `checkSdoAuth()` → `check_sdo_auth`; `listCourses()` (без сессии) → `list_courses`; `findCourseModule(courseUrl, query)` → `find_course_module`; `getAssignmentDetails(url)` → `get_assignment_details`. Методы `findBbbActivity`/`getBbbUrl` и типы `Credentials`/`Session`/`BbbActivity`/`BbbUrl` удалены.
- `JobRunner` search-ветка теперь вызывает `resolveOnlineLecture` и явно обрабатывает `auth_required`/`not_found`/`ambiguous`, после резолва закрывает MCP. `credentials` из `runJob` убраны (аутентификация — по storage state).
- Общий разбор ответа вынесен в `callJsonTool`/`readText` (`content[].text` → JSON), поэтому все инструменты используют один контракт.
- **Slice 1 login делегирован MCP (сделано).** Онбординг больше не реализует SSO сам: worker запускает `sdo_mcp` с `SDO_USERNAME`/`SDO_PASSWORD`/`SDO_AUTH_STATE_PATH`/`HEADLESS` и вызывает tool `sdo_login`; MCP проходит cabinet-SSO и пишет **общую** сессию в `auth.json`. `checkSession` → `check_sdo_auth` (`SdoMcpSessionProvider` вместо удалённых `tusur-session.ts`/`tusur-detect.ts`). В `sdo_mcp` для этого: `saveAuthState` пишет в `SDO_AUTH_STATE_PATH` и добавлен tool `sdo_login`.

## Запуск реального MCP-сервера (сделано)

- `loadMcpConfig` (`src/config/mcp-config.ts`) разбирает `SDO_MCP_SERVER_PATH` как **командную строку** (`splitCommandLine`: executable + args, поддержка кавычек); читает `SDO_MCP_SERVER_CWD`; `MCP_TIMEOUT_MS` как fallback для `SDO_MCP_CONNECTION_TIMEOUT`.
- `collectServerEnv` форвардит серверу только нужные переменные: `SDO_*`, `MCP_*`, `BBB_*`, `TUSUR_*`, `HEADLESS` плюс GUI-переменные (`DISPLAY`, `WAYLAND_DISPLAY`, `XDG_*`, `XAUTHORITY`, `DBUS_SESSION_BUS_ADDRESS`).
- `StdioClientTransport` получает `args`/`cwd`/`env` (раньше всегда `args: []` и дефолтное окружение).
- `src/cli/index.ts` грузит `.env` через `process.loadEnvFile('.env')` (отсутствие файла — ок); шаблон — `.env.example`.
- `playwright-fetcher.ts` при `content-type: application/json` возвращает сырое тело ответа, а не обёртку JSON-viewer'а Chromium (нужно для `course_links`).

## Жизненный цикл лекции (перенесён из `codex/ready-online-lecture`)

- `src/core/lecture-session-controller.ts` — единственное место, где решаются переходы запуска: жёсткий `leaveAt` (нет входа/переподключения после него, причина `deadline`), повторы 5/15/30 с, четвёртая ошибка → `failed/error`, `moderator_removed` → `blocked` без повторов, `AbortSignal` → `completed/manual` только после закрытия браузера.
- `JobRunner.runJob(jobId, occurrenceId, signal?)` атомарно забирает запуск (`RunRepository.claimScheduled`/`skipScheduled`), резолвит цель через текущий `resolveOnlineLecture` и передаёт BBB-порт контроллеру. Повторный вызов для уже начатого/завершённого вхождения браузер не открывает.
- `PlaywrightBbbSessionManager.startSession(url, config, signal?)` — прерываемый и ограниченный по времени старт, очистка ресурсов при отмене; `channel` из выбора браузера сохранён.
- CLI `run-job`: SIGINT/SIGTERM прерывают только активный запуск и ждут выхода из BBB; код выхода 1 при `failed`, в выводе — отредактированная ошибка.
- **Ограничение:** адаптер распознаёт только `connected` (`[data-testid="audio-connected"]`, фикстура `tests/fixtures/bbb-lifecycle/connected.html`). Waiting-room, конец встречи и удаление модератором без подтверждённых селекторов не угадываются: такая страница даёт `UnsupportedBbbObservationError` → `failed/error`. Нужна проверка на живой BBB и фикстуры реальных страниц.

## Что ещё НЕ сделано

Slice 2a (импорт, автозапуск лекций, остановка/пропуск, индикация в окне и трее) готов. Осталось:

1. **Slice 2b:** реализован в ветке `feat/desktop-schedule-editing`; требуется Windows-проверка по чек-листу выше.
2. **Slice 3:** уведомления и журнал.
3. **Фаза 4:** Windows-упаковка одним установщиком (electron-builder).
4. **Windows-верификация (вручную):** реальный SSO-вход, DPAPI-шифрование пароля, автозапуск через реестр, поведение трея, тестовая лекция — см. чек-лист ниже; в песочнице проверялось только с фиктивным провайдером.
5. **Живые фикстуры BBB:** waiting-room, конец встречи, удаление модератором — по реальным страницам.
6. **Живой smoke:** парсинг можно проверить с `auth.json`; полный импорт с созданием заданий требует установленного `sdo_mcp` и `SDO_MCP_SERVER_PATH`, а также session storage state в `SDO_AUTH_STATE_PATH`.

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

- [ ] Реальный SSO: вход по логину/паролю (делегируется `sdo_mcp` через `sdo_login`) создаёт `%LOCALAPPDATA%/OnlineLecture/auth.json` с SDO-сессией; при капче/2FA повтор с `HEADLESS=false` открывает видимое окно MCP.
- [ ] DPAPI: `credentials.enc` расшифровывается на этой же учётке; при переносе на другую машину пароль не читается (ожидаемо).
- [ ] Автозапуск: переключатель в UI меняет запись автозапуска и `settings.json`.
- [ ] Трей: закрытие окна сворачивает в трей, «Выход» завершает процесс и ядро.
- [ ] Данные лежат вне репозитория (`%LOCALAPPDATA%/OnlineLecture/`), секреты не попадают в логи.

Тестовый живой пример группы: `fvs/574-1`; онлайн-пары — РМП2 (SDO id `22413`) и РВП (`22414`).

## Оговорки

- Slice 1 desktop готов и покрыт UI/логическими тестами; реальный SSO, DPAPI, автозапуск и трей требуют ручной проверки на Windows (см. чек-лист).
- Baseline `lint`/`format:check` грязный по всему репозиторию; новые файлы оцениваются по дельте и должны быть чистыми.
- `data/lectures.db` и бэкапы в git — давняя проблема гигиены, не связана с фичей.
