# Design

## Context

Автоимпорт переводит приложение из ручного добавления пар в сценарий «один раз ввёл логин и пароль — дальше само». Полный согласованный дизайн и обоснование: [2026-10-02-timetable-auto-import-design.md](../../../docs/superpowers/specs/2026-10-02-timetable-auto-import-design.md). Поведенческие контракты — в `specs/timetable-import`, `specs/onboarding` и `specs/schedule-model`.

## Goals / Non-Goals

**Goals:**

- Автоматически находить группу студента на `timetable.tusur.ru` по авторизованной сессии.
- Отбирать онлайн-пары по признаку «реализуется в ЭИОС» и связывать их с курсами SDO.
- Создавать и обновлять задания, не теряя ручных пар, правок и скрытых вхождений.
- Держать весь импорт в ядре (`src/timetable/`) независимо от Electron и тестируемым на фикстурах.

**Non-Goals:**

- Импорт произвольных календарей и сложные cron-расписания.
- Обход запрета модератора и несколько аккаунтов.
- Реализация SSO-входа, Electron UI и Windows-упаковки в этом change (фазы 1–2 плана).

## Decisions

### Потоки и модули

```text
Onboarding (логин, пароль)
        |
        v
SSO profile.tusur.ru  ->  общая сессия (.tusur.ru)
        |
        v
TimetableClient: авторизованная главная -> ссылка «Мое расписание» -> faculty, group
        |
        +-- страницы группы по неделям -> пары (дата, время, дисциплина, ЭИОС, lesson-id)
        |
        +-- /ocenka/api/v1/lessons/<id>/course_links -> discipline -> sdoCourseId
        |
        v
SDO MCP resolve_online_lecture(courseUrl) -> BBB-активность
        |
        v
TimetableImporter -> Job'ы (source=timetable)
        |
        v
ImportMerger (SQLite): авто-задания + ручные пары + правки (suppressed/edited)
        |
        v
Существующий Scheduler / run-lifecycle
```

Модули: `timetable-client.ts`, `timetable-parser.ts`, `online-selector.ts`, `course-mapper.ts`,
`timetable-importer.ts`, `import-merger.ts`, адаптер `playwright-fetcher.ts`. Сеть скрыта за
портом `HttpFetcher`, резолв BBB — за портом `OnlineLectureResolver`, поэтому ядро тестируется
без сети и браузера.

### Модель данных

- Третий вид расписания `imported` с `timezone` и вхождениями
  `{ date, joinAt, leaveAt, room?, edited?, suppressed? }`.
- `Job.source = 'manual' | 'timetable'`; `Job.origin = { faculty, group, discipline, sdoCourseId }`.
- Стабильный id `tt:<faculty>:<group>:<sdoCourseId>` — обновление это слияние, а не пересоздание.
- Задания без `source` считаются `manual` (безопасная миграция).
- `findActiveOccurrence()` получает ветку `imported`: совпадение по `date` и окно `[joinAt, leaveAt)`.

### Слияние и правки

При обновлении для каждой дисциплины ищется авто-задание по id:
`edited` сохраняется, `suppressed` не возвращается, новые даты добавляются, исчезнувшие
неотредактированные удаляются. `source: manual` не изменяется никогда. Ручное удаление
авто-пары = `suppressed`, ручной пары — реальное удаление. Совпадение ручной и авто-пары по
(дата, время, дисциплина) даёт один вход. Refresh не трогает активное вхождение.

### Резолв BBB и ошибки

MCP `resolve_online_lecture` возвращает `resolved`/`ambiguous`/`not_found`/`auth_required`;
`ambiguous` требует выбора пользователя, `not_found` пропускает дисциплину с уведомлением,
`auth_required` требует повторного входа. Принцип ошибок: никогда не стирать расписание молча —
при сбое сети или разметки сохраняется последнее рабочее состояние и предлагается «Повторить».
Временные сбои входа повторяются по политике 5/15/30 секунд, `leaveAt` — жёсткий предел.

### Приватность

Логин и пароль хранятся только локально, пароль шифруется DPAPI на Windows. Браузерная сессия,
база и логи — в `%LOCALAPPDATA%`. Cookies, query-параметры, join URL и `sessionToken` вырезаются
из логов. В репозиторий не попадают реальные сессии и персональные данные студентов.

## Risks / Trade-offs

- [Разметка timetable может измениться] -> парсер даёт явную ошибку и не портит сохранённое расписание.
- [Соответствие «дисциплина -> SDO-курс» неполное] -> контрактный тест на `course_links` и fallback на поиск по названию.
- [Капча/2FA при программном входе] -> запасное видимое окно ТУСУР.
- [Горизонт расписания известен только на семестр] -> обязательное обновление при запуске и по кнопке.

## Migration Plan

1. Расширить модель расписания и добавить порт резолва, не меняя существующие задания (без `source` = `manual`).
2. Добавить импортёр, слияние и CLI `import` за портами `HttpFetcher` и `OnlineLectureResolver`.
3. Подключить Playwright-адаптер авторизованной выборки и выполнить ручной smoke по флагу.
4. SSO-вход, Electron UI и упаковка входят в отдельные фазы; rollback — удаление `src/timetable/`,
   CLI-команды и созданных в тестовой среде заданий.
