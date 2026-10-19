# Proposal

## Why

Собранный desktop работает в developer-окружении и прошёл Linux Electron E2E, но Windows-установщика пока нет. Не определены состав runtime-зависимостей, расположение нативной SQLite и запуск дочерних CLI вне ASAR. Main и SDO MCP могут читать `.env`, что недопустимо для установленного приложения.

## What Changes

- Подготовить Windows x64 NSIS-установщик для текущего пользователя без обязательных внешних developer-инструментов.
- Явно упаковать production-граф, Electron-native SQLite, SDO MCP и Playwright CLI с проверкой их путей и состава.
- Разделить developer и packaged конфигурацию, запретить `.env` во всей цепочке main → worker → MCP.
- Закрепить appId, single-instance и безопасное сохранение пользовательских данных при обновлении/удалении.
- Добавить проверки упакованного runtime и документированный Windows smoke.

Chromium не включается: по подтверждённой пользователем политике Windows использует Edge по умолчанию, Chromium устанавливается кнопкой внутри приложения.

## Capabilities

### New Capabilities

- `windows-packaging`: состав установщика, runtime-пути, конфигурация packaged-режима и проверки поставки.

### Modified Capabilities

Существующий контракт `browser-choice-install` не меняется; упаковка должна обеспечить его работу без системных Node.js/npm.

## Non-goals

Публичная публикация, покупка сертификата/подпись, автообновления, per-machine/MSI/portable, другие архитектуры и автоматические обращения к реальным системам ТУСУР не входят в этот этап.

## Impact

Desktop manifest/lockfile, конфигурация electron-builder, build-проверки, main/worker runtime-конфигурация, внутренний контракт процессов и тесты. Публичный renderer API, расписание и схема данных не меняются. Согласованный пользователем дизайн: [2026-10-19-windows-packaging-design.md](../../../docs/superpowers/specs/2026-10-19-windows-packaging-design.md). План реализации также согласован; исполнение передаётся DeepSeek.
