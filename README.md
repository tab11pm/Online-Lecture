# Online Lecture — техническое ядро

Пока UI нет, ядро запускается через TypeScript CLI. Нужен Node.js 22+.

```bash
npm ci
npm test
```

Проверить YAML-конфигурацию:

```bash
npm run cli -- config validate --config tests/fixtures/weekly-job.yml
```

Проверить отрицательный сценарий (команда вернёт код `1`):

```bash
npm run cli -- config validate --config tests/fixtures/invalid-bbb-url.yml
```

Создать локальную SQLite-базу и проверить активное occurrence в фиксированный момент времени:

```bash
npm run cli -- run --config tests/fixtures/once-job.yml --db .data/lectures.sqlite --now 2026-09-28T03:15:00Z
npm run cli -- jobs list --db .data/lectures.sqlite
npm run cli -- run-once math-once --db .data/lectures.sqlite --now 2026-09-28T03:15:00Z
```

`run` и `run-once` создают только локальный запуск со статусом `scheduled`. В этом change нет SDO MCP, Playwright или подключения к BigBlueButton, поэтому приложение не открывает браузер и не сообщает ложное `connected`.

```bash
npm run cli -- auth check
```

Пока вернёт код `2`: интеграция SDO MCP будет отдельным OpenSpec change.
