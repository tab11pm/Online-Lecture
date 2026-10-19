# Design

## Context

Проект дизайна: [2026-10-19-windows-packaging-design.md](../../../docs/superpowers/specs/2026-10-19-windows-packaging-design.md). Требует ревью пользователя до реализации.

## Goals / Non-Goals

**Goals:** проверяемый Windows x64 NSIS-пакет без внешних developer-зависимостей; корректные native/CLI-пути; отсутствие `.env` в packaged-режиме; сохранение локальных данных.

**Non-Goals:** встроенный Chromium, изменения интерфейса/планировщика, публичный релиз, подпись, автообновления и unattended реальный SSO/BBB.

## Decisions

- Один per-user NSIS `.exe`, стабильный `appId=ru.onlinelecture.desktop`, без автоматического включения автозапуска.
- Код в ASAR; весь production-граф зависимостей распакован; отдельная Windows Electron-native SQLite в `resources/native`.
- Windows-сборка проверяет stamp и PE/архитектуру, не пересобирает общую Node-native SQLite workspace.
- Packaged-политика задаётся main через `app.isPackaged`; dev `.env` остаётся, packaged main и bundled MCP его не читают.
- Данные и общий Playwright browser cache не удаляются uninstaller; удаляются только собственные ярлыки и регистрация автозапуска.
- Приёмка различает unit, проверку состава пакета, packaged fake-session E2E и фактический Windows smoke.

## Risks / Trade-offs

Распаковка всего production-графа менее компактна, но устраняет зависимость запуска CLI от частичного списка модулей. Неподписанная тестовая сборка может показывать предупреждения Windows и не считается публичным релизом. Полная проверка требует Windows без исходного репозитория и developer Node/npm; Linux не заменяет её.
