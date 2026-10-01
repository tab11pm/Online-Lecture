# Proposal

## Why

Текущая реализация `JobRunner.runJob()` не передаёт `leaveAt` deadline в BBB-мониторинг, не вызывает `leaveIfDeadlineReached()` и `nextRetryDelay()`, не обрабатывает SIGINT/SIGTERM, а `reconnecting` и `waiting_room` остаются нереализованными состояниями. Без этих компонентов приложение не может корректно завершать лекции по расписанию, переподключаться при разрывах сети и реагировать на пользовательскую остановку.

## What Changes

- Добавить передачу `Occurrence` (включая `joinAt`, `leaveAt`, `timezone`) в `PlaywrightBbbSessionManager`
- Реализовать `BbbMonitor` модуль с cancellable loop, deadline check и retry logic
- Добавить `GracefulShutdown` модуль с SIGINT/SIGTERM обработкой
- Реализовать `waiting_room` состояние при ожидании модератора
- Интегрировать `leaveIfDeadlineReached()` и `nextRetryDelay()` из существующих модулей
- Добавить fixture E2E тесты BBB-событий (moderator removed, meeting ended, network error)

## Out of Scope

- Изменение структуры БД или миграций (текущая схема достаточна)
- SDO MCP интеграция (отдельный change)
- UI/ Electron компоненты
- Изменение CLI команд
- Автоматическое пробуждение компьютера из сна
- Обработка удаления модератором через эвристику (требует BBB fixture подтверждения)

## Capabilities

### New Capabilities

- `bbb-session-lifecycle`: управление состояниями BBB-сессии включая waiting_room, connected, reconnecting, leaving
- `deadline-enforcement`: автоматический выход по `leaveAt`
- `retry-logic`: политика 5/15/30 секунд при network errors
- `graceful-shutdown`: корректное завершение по SIGINT/SIGTERM и ручному stop

### Modified Capabilities

- `lecture-running`: расширяется с простого join/leave на полный lifecycle с мониторингом