# Proposal

## Why

Приложение выполняет вход через SDO MCP, но путь к серверу берётся из `SDO_MCP_SERVER_PATH` или `~/.local/bin/sdo-mcp`. У обычного пользователя Windows нет ни того, ни другого: нужно склонировать sdo_mcp, поставить Node.js, собрать проект и скачать браузер Playwright. Тест на чужом компьютере показал, что без этого приложение падает на проверке сессии и показывает «Выполните вход» вместо настоящей причины.

## What Changes

- Подготовить `tab11pm/sdo-mcp` к установке как git-зависимости (`prepare`, `files`, `main`, `bin`), добавить `SDO_BROWSER_CHANNEL` и включать отладочные скриншоты только по флагу; выпустить тег `v1.2.0`.
- Добавить зависимость `sdo_mcp` (`github:tab11pm/sdo-mcp#v1.2.0`) в корень и в `apps/desktop`.
- Находить точку входа установленного пакета и запускать её через `process.execPath` с `ELECTRON_RUN_AS_NODE=1`; порядок источников: `SDO_MCP_SERVER_PATH` > пакет > `~/.local/bin/sdo-mcp` > `sdo-mcp` из PATH.
- Применять `connectionTimeout` и классифицировать ошибки подключения (`not_found`, `exited`, `timeout`) с редактированным хвостом stderr.
- Показывать в онбординге отдельное сообщение о недоступности SDO MCP вместо формы входа.
- Вести файловый журнал ядра `logs/core.log` с редакцией секретов и ротацией.

## Capabilities

### New Capabilities

- `sdo-mcp-runtime`: поставка, поиск и запуск SDO MCP, классификация ошибок запуска, сообщение пользователю и журнал ядра.

### Modified Capabilities

<!-- Отсутствуют: требования к onboarding из timetable-auto-import не меняются; новое сообщение об ошибке описано в `sdo-mcp-runtime`. -->

## Impact

Затрагивает два репозитория. В `sdo_mcp` — `package.json`, запуск браузера и отладочные скриншоты. В `online-lecture` — `src/config/mcp-config.ts`, `src/core/mcp-client.ts`, `src/core/types.ts`, онбординг и worker десктопа, `package.json` и `package-lock.json`. Настройка `electron-builder` остаётся в фазе 4; дизайн фиксирует для неё требования (`asarUnpack`, fuse `RunAsNode`). Полный дизайн: [2026-10-13-bundled-sdo-mcp-design.md](../../../docs/superpowers/specs/2026-10-13-bundled-sdo-mcp-design.md).
