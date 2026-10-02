# Electron: онбординг, авторизация ТУСУР и трей — дизайн

**Дата**: 2026-10-02
**Статус**: Approved for implementation
**Проект**: Online Lecture для SDO ТУСУР
**Фаза**: 3 (Windows Electron приложение), слайс 1
**Источник истины**: `SPEC.md` §7, §9, §11.4; `.planning/ROADMAP.md` (Phase 999.6)

## 1. Цель

Дать нетехническому пользователю Windows первый вертикальный срез приложения: приложение
запускается, проводит онбординг, получает общую сессию `*.tusur.ru` и продолжает работу в
трее. Сессия сохраняется как Playwright storage state, пригодный для SDO MCP
(`SDO_AUTH_STATE_PATH`) и импорта расписания (`--auth-state`).

Слайс не реализует список расписаний, редактор, импорт, журнал и упаковку — они идут
следующими слайсами/фазами.

## 2. Что входит и что не входит

Входит:

- Electron-оболочка (main + preload + React renderer) в новом пакете `apps/desktop/`.
- Онбординг: форма логина и пароля, автоматический вход в SSO `profile.tusur.ru`,
  fallback на видимое окно при капче/2FA/неудаче.
- Локальное хранение пароля (Electron `safeStorage`, на Windows — DPAPI) и общей
  браузерной сессии `.tusur.ru`.
- Проверка действующей сессии перед переходом к дальнейшим шагам.
- Трей со статусом и явный тумблер автозапуска.
- Отдельный Node utility-процесс для ядра (Playwright, SQLite, будущий планировщик).

Не входит:

- Авто-импорт расписания, список/правки/«Перенести», ручной запуск и остановка лекции,
  авто-импорт с прогрессом — слайс 2.
- Уведомления и журнал — слайс 3.
- Установщик, упаковка, встроенный SDO MCP, Windows E2E, реальная проверка DPAPI —
  фаза 4.

## 3. Принятые решения

| Решение | Выбор | Причина |
|---------|-------|---------|
| Первый слайс | Онбординг + авторизация + трей | Фундамент для остальных слайсов |
| Механизм входа | Форма + автологин, fallback на видимое окно | Соответствует SPEC §7.1 |
| Размещение ядра | Отдельный Node utility-процесс | Playwright/планировщик не блокируют UI |
| Сборка | electron-vite + electron-builder | HMR в dev, готовый Windows-инсталлятор |
| Пакеты | npm workspaces `["apps/*"]` | Единый install, ядро импортируется по alias |

## 4. Архитектура

Три процесса:

- **main** — жизненный цикл приложения, окна, трей, автозапуск, `safeStorage`, IPC-роутер.
- **utility (`core-host`)** — онбординг-логин и хранение сессии; в дальнейшем — SQLite,
  `Scheduler`, `JobRunner`. Общается с main типизированными сообщениями через `MessagePort`.
- **renderer** — React/TypeScript, `nodeIntegration: false`, `contextIsolation: true`;
  доступ только через `window.desktop`, опубликованный preload.

```
apps/desktop/
  electron.vite.config.ts        # externalizeDeps: better-sqlite3, playwright
  package.json                   # electron, react, electron-vite, electron-builder
  src/main/index.ts              # lifecycle, BrowserWindow, Tray, autostart
  src/main/ipc.ts                # типизированные handlers
  src/main/secret-store.ts       # SecretStore поверх safeStorage
  src/preload/index.ts           # contextBridge → window.desktop (узкий API)
  src/renderer/                  # React onboarding + минимальное главное окно
  src/worker/core-host.ts        # utilityProcess: логин, storage state, (позже SQLite/Scheduler)
  src/shared/ipc-contract.ts     # общие типы каналов
```

Ядро `src/` остаётся на месте и импортируется по alias `@core`; код ядра не зависит от
Electron. `better-sqlite3` и `playwright` выносятся в `external` сборки, чтобы не
бандлились нативные модули.

## 5. Расположение данных

Корень — `app.getPath('userData')` (`%LOCALAPPDATA%/OnlineLecture` на Windows):

| Файл | Назначение |
|------|------------|
| `data/lectures.db` | SQLite-расписание (следующие слайсы) |
| `auth.json` | Общий Playwright storage state `.tusur.ru` |
| `credentials.enc` | Зашифрованный пароль (`safeStorage`/DPAPI) |
| `settings.json` | Нефишевые настройки (autostart, тема) |
| `logs/` | Ротация логов без секретов |

Пути вычисляются в main и передаются в worker; renderer путей не видит.

## 6. Онбординг и авторизация

Состояния (стейт-машина в worker):

```
welcome -> credentials -> authenticating -> session_ready
                               |
                               +-> manual_sso -> session_ready
                               |
                               +-> failed (показ ошибки, возврат в credentials)
```

### 6.1 Автоматический вход

1. Renderer отправляет `onboarding.login({ username, password })`.
2. Main шифрует пароль через `SecretStore` и передаёт plaintext в worker **только в
   памяти**. Пароль не пишется в логи и не сохраняется в открытом виде.
3. Worker запускает Chromium (headless) и открывает форму `profile.tusur.ru`.
4. При успешном входе worker снимает `context.storageState({ path: auth.json })` с правами
   `0600` и переходит в `session_ready`.
5. При капче/2FA/неудачном входе worker сигналит `manual_sso`.

### 6.2 Ручной вход (fallback)

Main открывает видимое окно ТУСУР (headful Chromium либо BrowserWindow). Пользователь
входит сам; после подтверждения входа worker сохраняет storage state в `auth.json`.
Пароль для этого пути не требуется.

### 6.3 Проверка сессии

`onboarding.checkSession()` валидирует `auth.json`: сначала `SdoMcpClient.checkSdoAuth()`
(инструмент `check_sdo_auth`), затем загрузка авторизованной главной `timetable.tusur.ru`.
Невалидная/истёкшая сессия возвращает пользователя в `credentials`.

Все CSS-селекторы страниц ТУСУР держатся в одном модуле, чтобы изоляция сбоев была
локальной.

## 7. Секреты

`SecretStore` (main) — тонкий интерфейс над `safeStorage`:

```ts
interface SecretStore {
  isAvailable(): boolean;
  encrypt(plaintext: string): Buffer;
  decrypt(blob: Buffer): string;
}
```

- На Windows `safeStorage` использует DPAPI; это боевой путь.
- Если шифрование недоступно (Linux dev/CI), используется явный plaintext-fallback с
  пометкой в файле и предупреждением в логе. Fallback никогда не включается молча на
  Windows.
- Пароль, cookies, join URL и `sessionToken` не попадают в логи, уведомления и
  диагностику; сообщения об ошибках проходят через `redactSensitiveText`.

## 8. IPC-контракт

`src/shared/ipc-contract.ts` — единый источник типов. preload публикует узкий
`window.desktop`:

Каналы запрос/ответ:

- `onboarding.getState()` → текущее состояние онбординга;
- `onboarding.login({ username, password })`;
- `onboarding.openManualSso()`;
- `onboarding.checkSession()`;
- `app.getInfo()` → версия, признак autostart (без путей к данным);
- `app.setAutostart(enabled)`;
- `app.quit()`;
- `core.getStatus()`, `core.start()`, `core.stop()`.

События main → renderer:

- `onboarding.changed(state)`;
- `core.statusChanged(status)`;
- `core.notification({ level, message })`.

Все handler'ы типизированы без `any`, ответы сериализуемы, секреты через IPC не ходят
обратно в renderer.

## 9. Трей и автозапуск

- Трей показывает статус (сессия/остановлено) и пункты «Открыть», «Остановить лекцию»
  (заглушка до слайса 2), «Выход».
- Закрытие главного окна скрывает его в трей, приложение продолжает работу.
- «Выход» останавливает worker и завершает приложение.
- Автозапуск: `app.setLoginItemSettings({ openAtLogin })`; тумблер в onboarding и в
  настройках; при запуске с `--hidden` окно не показывается.

## 10. Тестирование

- **Unit (vitest)**: стейт-машина онбординга, `SecretStore` с инъекцией fake,
  IPC-хендлеры на фейковом worker/main, redaction секретов.
- **Renderer**: jsdom + Testing Library — форма входа, переходы состояний, обработка
  ошибок.
- **E2E**: Playwright `_electron` на Linux через фейковый `SessionProvider`; головной
  вход в ТУСУР в CI не выполняется.
- **Фикстуры**: обезличенные страницы входа ТУСУР в `tests/fixtures/`.
- **Ручная проверка на Windows** (фаза 4): реальный SSO, DPAPI, автозапуск, трей.

Ограничение: DPAPI и реальный SSO недоступны на Linux, поэтому в этом слайсе они за
интерфейсами с фейками; боевая проверка — на Windows.

## 11. Критерии приёмки слайса

1. `npm run build` и `npm test` зелёные; новые файлы чистые по prettier/eslint (по дельте).
2. `npm run dev -w apps/desktop` поднимает приложение, показывает онбординг.
3. Форма логина вызывает `onboarding.login`, при успехе появляется экран «сессия активна»,
   файл `auth.json` создаётся.
4. Fallback-ветка `manual_sso` открывает видимое окно и по завершении сохраняет сессию.
5. `onboarding.checkSession()` различает валидную и истёкшую сессию.
6. Закрытие окна скрывает приложение в трей; «Выход» завершает процесс.
7. Тумблер автозапуска сохраняется в `settings.json` и отражается в `app.getLoginItemSettings()`.
8. Секреты не появляются в логах (проверено тестом redaction).
