# Proposal

## Why

На Windows вход через SDO MCP использует Edge, а импорт расписания и BBB запускают Chromium Playwright. Пользователь не может выбрать Chromium в приложении и должен выполнять `npx playwright install chromium` вручную. Это противоречит пользовательскому сценарию без терминала из `SPEC.md`.

## What Changes

- Добавить в десктопное приложение выбор Edge или Chromium.
- Проверять наличие Chromium для установленной версии Playwright и предлагать установку кнопкой.
- Показывать ход загрузки, ошибку и повторную попытку.
- Применять выбранный браузер к SDO MCP, импорту расписания и BBB.
- Сохранить работу CLI и приоритет явно заданного `SDO_BROWSER_CHANNEL` для разработки.

## Capabilities

### New Capabilities

- `browser-choice-install`: выбор браузера, проверка и установка Chromium в десктопном приложении.

### Modified Capabilities

<!-- Нет: выбор пользователя передаётся как заданное значение окружения, поэтому существующее правило `sdo-mcp-runtime` о значении по умолчанию остаётся верным. -->

## Impact

Затрагивает настройки и IPC десктопа, экран входа и настройки после входа, запуск Playwright в SDO MCP, импорте и BBB, а также требования к будущему Windows-установщику. Полный дизайн: [2026-10-15-chromium-choice-install-design.md](../../../docs/superpowers/specs/2026-10-15-chromium-choice-install-design.md).
