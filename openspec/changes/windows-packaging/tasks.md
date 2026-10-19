# Tasks

План: [2026-10-19-windows-packaging.md](../../../docs/superpowers/plans/2026-10-19-windows-packaging.md). Реализация 1–4 и 5.1 выполнена; доступные Linux-гейты пройдены. Windows-сборка и приёмка ещё не выполнялись; dev Electron E2E заблокирован отсутствием Playwright Chromium в окружении.

## 1. Packaged runtime

- [x] 1.1 Изолировать env/SQLite и передать доверенный runtime mode worker (план Task 1).
- [x] 1.2 Защитить bundled MCP от dotenv с исполняемым regression-тестом (план Task 1).

## 2. Windows identity

- [x] 2.1 Добавить appId, single-instance и стабильное имя autostart (план Task 2).

## 3. Ресурсы и зависимости

- [x] 3.1 Явно объявить production-зависимости и добавить native/package validators (план Task 3).

## 4. Установщик

- [x] 4.1 Добавить Windows-only pack/dist, NSIS, проверку перед выпуском и SHA-256 (план Task 4).
- [x] 4.2 Сохранить данные при uninstall и удалять только собственный autostart (план Task 4; фактическая Windows-проверка — 5.3).

## 5. Проверка

- [x] 5.1 Добавить packaged fake-session E2E и executable runtime smoke (план Task 5).
- [ ] 5.2 Пройти доступные unit/build/dev Electron-гейты и обновить handoff (план Task 5). Unit/build и handoff готовы; dev Electron E2E требует установленного Playwright Chromium.
- [ ] 5.3 Фактически проверить чистую Windows: установка, runtime, браузеры, DPAPI, трей, автозапуск, обновление и uninstall (план Task 5).
