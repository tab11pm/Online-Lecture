# Tasks

План: [2026-10-19-windows-packaging.md](../../../docs/superpowers/plans/2026-10-19-windows-packaging.md). Дизайн и план согласованы пользователем; реализация передаётся DeepSeek и пока не начата.

## 1. Packaged runtime

- [ ] 1.1 Изолировать env/SQLite и передать доверенный runtime mode worker (план Task 1).
- [ ] 1.2 Защитить bundled MCP от dotenv с исполняемым regression-тестом (план Task 1).

## 2. Windows identity

- [ ] 2.1 Добавить appId, single-instance и стабильное имя autostart (план Task 2).

## 3. Ресурсы и зависимости

- [ ] 3.1 Явно объявить production-зависимости и добавить native/package validators (план Task 3).

## 4. Установщик

- [ ] 4.1 Добавить Windows-only pack/dist, NSIS, проверку перед выпуском и SHA-256 (план Task 4).
- [ ] 4.2 Сохранить данные при uninstall и удалять только собственный autostart (план Task 4; фактическая Windows-проверка — 5.3).

## 5. Проверка

- [ ] 5.1 Добавить packaged fake-session E2E и executable runtime smoke (план Task 5).
- [ ] 5.2 Пройти доступные unit/build/dev Electron-гейты и обновить handoff (план Task 5).
- [ ] 5.3 Фактически проверить чистую Windows: установка, runtime, браузеры, DPAPI, трей, автозапуск, обновление и uninstall (план Task 5).
