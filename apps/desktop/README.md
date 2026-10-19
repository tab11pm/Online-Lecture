# @online-lecture/desktop

Windows-приложение (Electron + React/TypeScript) для локального ядра Online Lecture.
Slice 1 закрывает onboarding: приветствие, форма логин/пароль ТУСУР, запасное видимое
окно SSO, проверку сессии, трей, автозапуск и хранение пароля через DPAPI.

## Команды

Из корня репозитория (workspace):

```bash
npm install
npm run dev -w @online-lecture/desktop        # electron-vite dev
npm run build -w @online-lecture/desktop      # electron-vite build (out/)
npm run typecheck -w @online-lecture/desktop  # tsc --noEmit (node + web)
npm test -w @online-lecture/desktop           # vitest (без GUI)
```

Общие гейты корня также включают desktop:

```bash
npm run build   # core tsc + desktop typecheck
npm test        # core suite + desktop suite
```

Запуск собранного приложения: `npm run start -w @online-lecture/desktop`.

## Windows-упаковка

Сборка выполняется только на Windows x64:

```bash
npm run pack:win -w @online-lecture/desktop   # dist/win-unpacked, без установщика
npm run dist:win -w @online-lecture/desktop   # NSIS OnlineLecture-Setup-<version>-x64.exe
```

На машине разработчика нужны Node.js, npm, Python и Visual Studio Build Tools с
рабочей нагрузкой «Разработка классических приложений на C++» — они нужны только для
сборки, но не пользователю установленного приложения. Обе команды проверяют версии
Playwright, собирают `out/` и отдельную Electron-native `better-sqlite3`, проверяют
PE x64 и stamp, затем проверяют реальный `dist/win-unpacked` (ASAR, production-граф,
запрещённые файлы, SHA-256 native-модуля). `dist:win` создаёт NSIS только из уже
проверенного `win-unpacked` и пишет рядом `OnlineLecture-Setup-<version>-x64.exe.sha256`.
На Linux команда завершается понятной ошибкой, не создавая артефакт.

Установщик — per-user NSIS без повышения прав. Код приложения лежит в
`resources/app.asar`, production-зависимости — в `resources/app.asar.unpacked/node_modules`,
SQLite — в `resources/native/better_sqlite3.node`. Chromium в установщик не входит:
на Windows по умолчанию используется Edge, Chromium скачивается только кнопкой в
приложении. Пользовательские данные в `%LOCALAPPDATA%/OnlineLecture` сохраняются при
обновлении и удалении; uninstaller удаляет только собственный автозапуск и ярлыки.

Первый тестовый `.exe` не подписан: Windows может показать предупреждение SmartScreen.
Публикация, сертификат и автообновления в этот этап не входят. Проверки на Linux не
заменяют приёмку на чистой Windows — см. `docs/windows-smoke.md`.

Packaged-режим определяется `app.isPackaged`: bundled main/worker не читают `.env`, а
SDO MCP запускается из распакованного пути с `DOTENV_CONFIG_PATH`, направленным на
системное пустое устройство.

## E2E с фиктивной сессией

`tests/e2e/` — четыре vitest-сценария через Playwright `_electron`: вход,
успешная лекция с ручной остановкой и журналом, ошибка лекции в журнале и
добавление/перенос/отмена переноса/удаление пары. Запускается desktop-пакет,
чтобы пути к нативной SQLite определялись как при обычном старте приложения.
Каждый сценарий получает отдельный временный `LOCALAPPDATA` и профиль Electron.
`ONLINE_LECTURE_FAKE_SESSION=1` подменяет провайдер и адаптеры фиктивными;
реальные SSO-креденшелы и университетские сервисы не используются. По умолчанию
сценарии пропускаются, чтобы `npm test` не требовал GUI:

```bash
npm run build -w @online-lecture/desktop
CI_ELECTRON_E2E=1 npm test -w @online-lecture/desktop -- tests/e2e
```

При явном включении E2E отсутствие сборки или ошибка запуска Electron приводят
к падению теста с причиной, а не к пропуску. Нужны Electron, GUI-сессия и
Playwright Chromium вместе с headless shell; используйте `PLAYWRIGHT_BROWSERS_PATH`,
если браузеры установлены в отдельный каталог. Успешный Linux-прогон не заменяет
проверку установщика, Edge и DPAPI на Windows.

## Архитектура

- `src/main/` — главный процесс Electron: окно, трей, автозапуск, IPC, `SecretStore`
  (DPAPI через `safeStorage` с явным fallback), `SettingsStore`, `CoreProcess`.
- `src/preload/` — узкий typed-мост `window.desktop` (contextIsolation, без node в renderer).
- `src/renderer/` — React-интерфейс onboarding.
- `src/worker/` — локальное ядро в utility process: `CoreHost`, `OnboardingMachine`,
  `SdoMcpSessionProvider` (делегирует вход в `sdo_mcp`) и in-memory `FakeSessionProvider`
  для E2E.
- `src/shared/` — типизированные контракты IPC, протокол ядра, onboarding, пути.

`ONLINE_LECTURE_FAKE_SESSION=1` заставляет `worker/entry.ts` инжектить
`FakeSessionProvider`; иначе `CoreHost` создаёт `SdoMcpSessionProvider`.

### Логин через SDO MCP

Приложение не логинится само, а запускает `sdo_mcp`. Он ставится как npm-зависимость
(`node_modules/sdo_mcp`) и запускается через Node, встроенный в Electron
(`process.execPath` с `ELECTRON_RUN_AS_NODE=1`), поэтому у пользователя не нужен Node.js.
На Windows сервер получает `SDO_BROWSER_CHANNEL=msedge` и использует установленный Edge.

Для разработки сервер можно переопределить через `.env` в корне репозитория:

```bash
SDO_MCP_SERVER_PATH=node C:\path\to\sdo_mcp\dist\index.js   # или путь к exe/скрипту
SDO_MCP_SERVER_CWD=C:\path\to\sdo_mcp
```

Если сервер не найден или не запустился, онбординг показывает экран с причиной вместо
формы входа, а подробности (источник команды, хвост stderr без секретов) пишутся в
`logs/core.log`.

Worker запускает сервер как stdio-процесс и при входе выставляет ему `SDO_USERNAME`,
`SDO_PASSWORD`, `SDO_AUTH_STATE_PATH=<userData>/auth.json`, `HEADLESS`. MCP сам проходит
cabinet-SSO и сохраняет общую сессию в `auth.json` (её же используют импорт расписания и
резолв BBB). Проверка сессии — tool `check_sdo_auth`.

## Пути данных

Windows: `%LOCALAPPDATA%/OnlineLecture/`

- `data/lectures.db` — SQLite-база расписания;
- `auth.json` — Playwright storage state (сессия ТУСУР);
- `credentials.enc` — пароль, зашифрованный DPAPI;
- `settings.json` — логин и настройка автозапуска;
- `logs/core.log` — журнал ядра: источник команды SDO MCP и ошибки запуска (секреты
  вырезаются, при размере больше 1 МБ файл переносится в `core.log.1`).

Секреты, cookies, `sessionToken` и join-URL никогда не коммитятся и не логируются.
