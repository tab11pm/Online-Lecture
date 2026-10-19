# Handoff — Online Lecture: автоимпорт расписания ТУСУР

## Windows: проект дизайна упаковки (2026-10-19)

Подготовлен `docs/superpowers/specs/2026-10-19-windows-packaging-design.md` и OpenSpec `windows-packaging`. Предлагаются per-user NSIS x64, отдельный native-ресурс SQLite, распакованный production-граф, запрет `.env` в packaged main/MCP, стабильный appId и single-instance. Chromium остаётся загрузкой по кнопке; данные сохраняются при обновлении и uninstall. Публичная публикация, подпись и автообновления не входят в этап.

Пользователь согласовал дизайн и план `docs/superpowers/plans/2026-10-19-windows-packaging.md` (пять задач), затем передал реализацию DeepSeek. Luna не запускается; Codex может проверить получившиеся изменения после реализации. OpenSpec tasks пока не выполнены, production-код не менялся. Проверены форматирование и `git diff --check`; OpenSpec CLI не установлен, автоматическая валидация не выполнена. Windows-установщик ещё не создавался и на Windows не проверялся.

## Windows: предварительный аудит упаковки (2026-10-19)

Следующий этап проверен без изменения production-кода; Luna выполнила независимый read-only аудит. Конфига electron-builder/NSIS и команды упаковки пока нет. `jsdom` нужен worker во время выполнения, но объявлен в desktop devDependencies; `better-sqlite3` объявлен только в корне workspace. Будущая упаковка должна явно включать production-зависимости, Electron-native SQLite, SDO MCP и его зависимости, Playwright CLI и согласованные пути вне ASAR.

Packaged-режим пока не отделён от dev-загрузки `.env` в main; установленный SDO MCP также импортирует `dotenv/config`. Нужно исключить чтение учётных данных из `.env` во всей цепочке main → worker → MCP, не только исключить файл из архива.

Пользователь уточнил, что прежнее требование `SPEC.md` включать Chromium в установщик устарело. Актуальна существующая политика `chromium-choice-install`: Edge по умолчанию на Windows, Chromium не входит в установщик и загружается только по кнопке. `SPEC.md` и roadmap приведены к этой политике; противоречие больше не блокирует проектирование упаковки. Production-код и Windows-сборка не менялись. Обновлён desktop README: четыре E2E, пакетный запуск, отдельные профили и ошибка вместо пропуска при явном включении тестов.

## Desktop: нативная Electron-проверка после дизайна (2026-10-19)

Дизайн сохранён коммитом `994ded6`. Следующий проход проверяет собранное приложение на Linux/Electron 44.5.1 с отдельным временным профилем и фиктивной сессией в каждом сценарии. E2E запускает desktop-пакет, а не `out/main/index.js`, чтобы `app.getAppPath()` корректно находил нативную SQLite. Явный запуск с `CI_ELECTRON_E2E=1` больше не превращает ошибки окружения в пропуски.

Нативный прогон выявил гонку: «Начать» во время начального `getState` не выполняло `checkSession`. Теперь разные операции выполняются последовательно, одинаковые объединяются; внутренний ответ `onboarding.stateResult` отделён от уведомлений `onboarding.changed`. Публичный renderer/preload API не менялся. Добавлены регрессии порядка запросов, посторонних уведомлений, остановки, таймаута и ошибки ядра.

Только worker с `ONLINE_LECTURE_FAKE_SESSION=1` использует часы, начинающиеся в полдень текущей красноярской даты и продолжающие идти. Это устраняет зависимость демопары от вечернего перехода через полночь; реальные часы и правила расписания не изменены.

Проверены четыре нативных E2E: вход; успешная лекция → ручная остановка → журнал; ошибочная лекция → журнал ошибок; добавление пары → перенос импортированной → отмена переноса → подтверждённое удаление ручной. Для запуска нужны собранная desktop-версия, Electron и Playwright Chromium с headless shell; команда и разбор находок — `openspec/changes/desktop-design-polish/electron-verification.md`.

Итоговые гейты: `npm test` — 328 core + 333 desktop (четыре opt-in пропуска в обычном запуске); отдельный Electron-прогон — 4/4. Core/desktop typecheck, production build, ESLint и Prettier изменённых TypeScript-файлов прошли. Повторное независимое Luna-ревью закрыло замечание по разделению ответов и уведомлений.

Windows/Edge, установщик, трей и автозапуск на Windows, DPAPI и реальные системы ТУСУР этим Linux-прогоном не проверены. Это следующий отдельный этап.

## Desktop: доводка дизайна (2026-10-19)

Текущие изменения в `fix/same-day-lecture-actions` сохраняют выбранный светлый/тёмный стиль и покрывают основной экран, меню пар, доступные модальные формы с закреплёнными действиями, ввод даты `ДД.ММ.ГГГГ` и времени `ЧЧ:ММ`, подтверждение удаления, компактный онбординг, журнал и состояния импорта/подключения. Обоснование и критерии: `openspec/changes/desktop-design-polish/`.

Вход и проверка сессии блокируют повторную отправку и показывают ожидание; пароль очищается после отправки. Журнал различает пустую историю и отсутствие ошибок; ошибка следующей страницы сохраняет записи, повтор использует прежний cursor, устаревший ответ после смены фильтра не блокирует дальнейшую загрузку. Импорт показывает завершённые этапы, частичный результат и прежнее время обновления при ошибке. Ожидание комнаты и переподключение больше не выдаются за успешное присутствие. Ядро, IPC и хранение не менялись.

Проверено: 318 desktop-тестов, четыре opt-in Electron E2E пропущены; desktop typecheck и production build; 92 браузерные компоновки (23 состояния, две темы, ширины 1000/600px), шесть сценариев ожидания/ошибок/повтора и десять регрессий предыдущего прохода форм. Следующий отдельный этап — ручная Windows/Electron-проверка.

## Desktop slice 3: уведомления и журнал (2026-10-19)

Ветка `fix/same-day-lecture-actions` содержит slice 3 по [дизайну](superpowers/specs/2026-10-19-desktop-notifications-journal-design.md) и [OpenSpec](../openspec/changes/desktop-notifications-journal/tasks.md). SQLite хранит безопасные события с уникальными ключами; история запусков берётся из `runs` и переживает удаление пары. При старте worker восстанавливает недостающие события для завершённых запусков без старых уведомлений. Вход, необходимость нового входа, неоднозначный поиск, ошибка импорта/ядра и исход лекции создают новые события. `skipped` виден в журнале без системного уведомления.

Системные уведомления показывают короткий фиксированный текст и безопасное название, подавляют повтор по ID; сбой `Notification` не мешает ядру. Нажатие открывает окно и журнал, в том числе во время онбординга. Экран «Журнал» показывает 50 новых записей, фильтр «Все / Ошибки», явную следующую страницу, время, исход и причину. Сырые `Run`, `Job.target`, URL подключения и тексты исключений не передаются в renderer. Технические сведения остаются в `core.log`.

Проверено: `npm test` вне файловой песочницы (328 core + 279 desktop; четыре opt-in E2E пропущены), целевые renderer-тесты (33), `npm run build`, `npm run build -w @online-lecture/desktop`, `git diff --check`. Внутри песочницы два MCP-теста не видят stdout/stderr дочернего процесса. Новые fake-session Electron E2E для успешного и неудачного запуска добавлены, но здесь не запущены: `node_modules/electron/dist/electron` отсутствует. OpenSpec CLI локально не установлен.

Ручная проверка на Windows:

- [ ] Проверить toast для входа, повторного входа, ошибки импорта, завершения, блокировки и неудачного подключения; нажатие должно открывать журнал из трея и во время онбординга.
- [ ] Сверить порядок, фильтр и следующую страницу после перезапуска; проверить отсутствие секретов в уведомлении и журнале.
- [ ] Запустить `CI_ELECTRON_E2E=1 npm test -w @online-lecture/desktop -- lectures` с установленным бинарником Electron и дисплеем.

Следом: Windows-упаковка и ручная Windows-проверка, реальные BBB-фикстуры.

## Desktop slice 2b: редактирование расписания (2026-10-18)

Ветка `feat/desktop-schedule-editing` добавляет правку времени отдельной будущей импортированной пары, перенос с отменой, разовую и еженедельную ручную пару и удаление/скрытие. Правки импорта и перенос записываются атомарно с резервной копией SQLite. Обновление расписания сохраняет `edited`, `suppressed` и ручные задания. Дубликат ручной пары подавляет совпадающее импортированное вхождение.

Мастер ручной пары принимает название курса или ссылку `https://sdo.tusur.ru/course/view.php?id=…`, вызывает MCP-поиск и требует выбор BBB-активности. URL активности хранится в worker за временным ID; в renderer уходят только безопасные названия, тип и ID. После сохранения ID недействителен. В повестке показываются источник, доступные действия и связь переноса. Команды редактирования отвечают через IPC с ID запроса; при выходе worker и таймауте вызовы завершаются ошибкой.

Проверено: `npm test` (315 core, 246 desktop; три E2E opt-in пропущены), `npm run build`, целевые тесты renderer и worker. `CI_ELECTRON_E2E=1 npm test -w @online-lecture/desktop -- lectures` компилируется, но на этой машине Electron не запускается: при установке с `--ignore-scripts` не появился бинарник. Нужно повторить E2E после установки Electron на машине с доступной загрузкой и дисплеем.

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

**SQLite под Electron.** Процесс ядра открывает базу через `better-sqlite3`, а это нативный модуль: сборка в `node_modules` сделана под системный Node (её используют тесты и CLI) и в Electron не загружается. Поэтому `npm run build:native -w @online-lecture/desktop` собирает отдельную копию под текущую версию Electron в `apps/desktop/native/better_sqlite3.node` (в git не попадает). `dev` и `build` вызывают его сами и пропускают, если сборка актуальна. На Windows для первой сборки нужны Visual Studio Build Tools (рабочая нагрузка «Разработка классических приложений на C++») и Python. Main передаёт путь ядру через `ONLINE_LECTURE_SQLITE_BINDING`. Если файла нет, приложение показывает «Модуль базы данных для приложения не собран…», а саму базу не трогает. В упаковке (фаза 4) этот файл нужно положить в ресурсы приложения.

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
