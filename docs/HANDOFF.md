# Handoff — Online Lecture: автоимпорт расписания ТУСУР

Краткий контекст, чтобы продолжать работу без повторного разбора. Обновляй по мере изменений.

## Состояние репозитория

- **Репозиторий:** `/home/tabek/D/tusur/online-lecture` (Node/TypeScript, ESM, vitest, better-sqlite3, Playwright, luxon, zod, commander).
- **HEAD:** `7316769` (ветка `master`), фича «Автоимпорт расписания ТУСУР» слита fast-forward.
- **Рабочее дерево:** чистое, кроме несвязанных `data/lectures.db` (modified) и `data/backups/*.sqlite` (untracked) — их не трогать.
- **Гейты:** `npm run build` чист · `npm test` = **165** (28 файлов) · `npm run lint` = 65 (старый baseline, дельта 0) · prettier по файлам фичи чист.

## Документы (источник истины)

- Дизайн: `docs/superpowers/specs/2026-10-02-timetable-auto-import-design.md`
- План: `docs/superpowers/plans/2026-10-02-timetable-auto-import.md`
- OpenSpec-change: `openspec/changes/timetable-auto-import/`
- Продуктовая спецификация: `SPEC.md` (обновлена)
- Roadmap: `.planning/ROADMAP.md` (фаза «Автоимпорт расписания ТУСУР»)
- Правила репозитория: `AGENTS.md`

## Что сделано (фазы 1–2 дизайна)

Ядро импорта в `src/timetable/`:

- `timetable-parser.ts` — парсер страницы группы; онлайн-пары по пометке **«реализуется в ЭИОС»**; полное имя дисциплины из `abbr[title]`; `ScheduleParseError`, если таблицы расписания нет (пустая неделя → `[]`).
- `course-mapper.ts` — `course_links` → id курса SDO; `buildCourseUrl(id)` → `https://sdo.tusur.ru/course/view.php?id=<id>`.
- `http-fetcher.ts` — порт `HttpFetcher { get(url): Promise<string> }`, принимает **абсолютные** URL.
- `timetable-client.ts` — `discoverGroup` (авторизованная главная → «Мое расписание» → `faculty/group`), недели `?week_id=`, `fetchOnlineLessons`, `fetchCourseLinks`.
- `online-selector.ts` — группировка онлайн-пар по дисциплине/курсу.
- `timetable-importer.ts` — сборка `Job`'ов (id `tt:<faculty>:<group>:<sdoCourseId>`, дедуп дублей id).
- `import-merger.ts` — слияние при обновлении.
- `playwright-fetcher.ts` — адаптер авторизованной выборки по storage state.

Интеграция в ядро/CLI:

- `src/core/types.ts` — `Schedule` с типом `imported`, `Job.source/origin`, `OnlineLectureResolver` и типы результата.
- `src/core/occurrence.ts` — ветка `imported` в `findActiveOccurrence`.
- `src/core/mcp-client.ts` — `resolveOnlineLecture` (метод MCP `sdo/resolveOnlineLecture`).
- `src/persistence/job-repository.ts` — `listAll`/`delete`.
- `src/cli/commands.ts` — команда `import` + `CliDependencies` (инъекция фетчера/резолвера для тестов).

## Ключевые инварианты (не ломать)

- Группа определяется автоматически по ссылке «Мое расписание»; факультет/группа у пользователя не спрашиваются.
- `lessonId` повторяется между неделями → дедуп по `lessonId + date` (не по одному `lessonId`).
- Merge: ручные пары (`source != 'timetable'`) не изменяются; `edited` сохраняется; `suppressed` не возвращается; удаление (`prune`) только при **полном** импорте.
- При `auth_required` или несмапившихся курсах — no-op: exit 1, БД не меняется.
- Парсер различает «пустая неделя» (`[]`) и «сломанная страница» (исключение).
- Никогда не логировать `sessionToken`, cookies, join-URL; секреты только локально.

## Что ещё НЕ сделано

1. **SDO MCP:** инструмент `resolve_online_lecture` не реализован. Без него импорт парсит расписание, но заданий не создаёт (всё `not_found`). Контракт: вход `courseUrl | courseQuery | lectureQuery`, выход `resolved | ambiguous | not_found | auth_required`; `courseUrl` = `https://sdo.tusur.ru/course/view.php?id=<id>`; не отдавать `sessionToken`; всегда закрывать browser/context.
2. **Фаза 3 (Electron):** onboarding (форма логин/пароль + запасное видимое окно SSO), хранение пароля (DPAPI), список/правки/«Перенести», трей, автозапуск.
3. **Фаза 4:** Windows-упаковка одним установщиком + E2E.
4. **Живой smoke не проводился:** нужен `auth.json` и рабочий SDO MCP.

## Как проверить на Windows

```powershell
npm install
npx playwright install chromium
npm run build
npm test

# реальный парсинг расписания:
npx playwright codegen --save-storage=./auth.json https://timetable.tusur.ru/   # войти и закрыть окно
npm run cli -- import --db ./data/lectures.db --auth-state ./auth.json
npm run cli -- jobs list --db ./data/lectures.db
```

Тестовый живой пример группы: `fvs/574-1`; онлайн-пары — РМП2 (SDO id `22413`) и РВП (`22414`).

## Оговорки

- SSO-вход/хранение пароля, Electron и упаковка сознательно вне фаз 1–2.
- Baseline `lint`/`format:check` грязный по всему репозиторию; новые файлы оцениваются по дельте и должны быть чистыми.
- `data/lectures.db` и бэкапы в git — давняя проблема гигиены, не связана с фичей.
