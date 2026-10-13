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

## E2E с фиктивной сессией

`tests/e2e/onboarding.test.ts` — vitest-спека, которая через Playwright `_electron`
поднимает `out/main/index.js`, проходит приветствие → форму входа → панель активной
сессии. Без сессии и без реального SSO: `ONLINE_LECTURE_FAKE_SESSION=1` подменяет
провайдер на `FakeSessionProvider`. По умолчанию тест пропускается, чтобы `npm test`
оставался зелёным без дисплея:

```bash
npm run build -w @online-lecture/desktop
CI_ELECTRON_E2E=1 npm test -w @online-lecture/desktop -- onboarding
```

Если сборки нет или Electron не стартует в окружении, тест помечается пропущенным
с причиной. Реальные SSO-креденшелы в тесте не используются.

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
