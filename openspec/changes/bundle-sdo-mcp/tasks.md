# Tasks

План реализации: [2026-10-13-bundled-sdo-mcp.md](../../../docs/superpowers/plans/2026-10-13-bundled-sdo-mcp.md).

## 1. Чистка клиента

- [ ] 1.1 Удалить `listCourses`, `findCourseModule`, `getAssignmentDetails` и типы `CourseModuleMatch(es)` с их тестами

## 2. Источник команды сервера

- [ ] 2.1 Добавить `McpServerSource` и `McpConfig.source`
- [ ] 2.2 Реализовать `resolveBundledServer` с переходом `app.asar` → `app.asar.unpacked`
- [ ] 2.3 Выбирать команду в порядке `env` > `bundled` > `user-install` > `path`; для `bundled` запускать `process.execPath` с `ELECTRON_RUN_AS_NODE=1`

## 3. Ошибки запуска

- [ ] 3.1 Добавить `SdoMcpUnavailableError` с причинами `not_found`, `exited`, `timeout`
- [ ] 3.2 Применять `connectionTimeout` к рукопожатию и собирать редактированный хвост stderr

## 4. Онбординг

- [ ] 4.1 Пробрасывать недоступность SDO MCP из провайдера сессии
- [ ] 4.2 Переводить онбординг в `failed` с текстом по причине и путём к журналу

## 5. Журнал и запуск в десктопе

- [ ] 5.1 Добавить `core.log` с редакцией и ротацией 1 МБ
- [ ] 5.2 Журналировать источник сервера и ошибки запуска
- [ ] 5.3 Задавать `SDO_BROWSER_CHANNEL=msedge` на Windows, если переменная не определена

## 6. Документация

- [ ] 6.1 Обновить `AGENTS.md`, `.env.example`, `apps/desktop/README.md`

## 7. Зависимость

- [ ] 7.1 После выпуска тега `v1.2.0` добавить `sdo_mcp` в корень и `apps/desktop` и проверить запуск без `SDO_MCP_SERVER_PATH`
