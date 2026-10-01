# Tasks

## 1. Модель данных `imported` и порт резолва

- [x] 1.1 Добавить `ImportedOccurrence`, `JobSource`, `JobOrigin`, вариант `schedule.type = 'imported'` и порт `OnlineLectureResolver` в `src/core/types.ts`
- [x] 1.2 Реализовать ветку `imported` в `findActiveOccurrence` (совпадение по дате, окно `[joinAt, leaveAt)`, пропуск `suppressed`)
- [x] 1.3 Экспортировать новые типы из `src/core/index.ts` и обновить контракт публичного API
- [x] 1.4 Покрыть тестами активное, подавленное и отсутствующее вхождение

## 2. Парсер страницы группы

- [x] 2.1 Создать обезличенные фикстуры авторизованной главной и недели группы
- [x] 2.2 Реализовать `discoverMyScheduleHref`, `parseFacultyAndGroup`, `parseWeekIds`, `parseLessons`
- [x] 2.3 Использовать полное имя дисциплины из `title`, а не аббревиатуру `abbr`
- [x] 2.4 Определять онлайн-признак «реализуется в ЭИОС» и собирать дату, время, вид, аудиторию и `lessonId`

## 3. Маппинг `course_links` в курс SDO

- [x] 3.1 Реализовать `parseCourseLinks`, `extractSdoCourseId` и `buildCourseUrl`
- [x] 3.2 Устойчиво возвращать пустой список для пустого или некорректного ответа
- [x] 3.3 Покрыть тестами извлечение id и построение Moodle-ссылки

## 4. `TimetableClient` поверх порта `HttpFetcher`

- [x] 4.1 Добавить порт `HttpFetcher` и базу `TimetableClient`
- [x] 4.2 Реализовать `discoverGroup`, `fetchWeekIds`, `fetchLessons`, `fetchCourseLinks`
- [x] 4.3 Реализовать `fetchOnlineLessons` с дедупликацией по `lessonId` и явной ошибкой при отсутствии ссылки на расписание

## 5. Группировка онлайн-дисциплин

- [x] 5.1 Реализовать `groupOnlineDisciplines` с кэшем `discipline -> sdoCourseId`
- [x] 5.2 Возвращать несопоставленные занятия отдельным списком

## 6. Импортёр заданий

- [x] 6.1 Реализовать `buildImportedJobs` с id `tt:<faculty>:<group>:<sdoCourseId>`, `origin` и расписанием `imported`
- [x] 6.2 Обработать `resolved`, `not_found`, `ambiguous` и `auth_required`
- [x] 6.3 Проставлять `target.type = 'direct'` для подтверждённой BBB-активности

## 7. Резолв BBB в `SdoMcpClient`

- [x] 7.1 Добавить `resolveOnlineLecture` и реализовать `OnlineLectureResolver`
- [x] 7.2 Покрыть контракт статусов ответа MCP

## 8. Слияние при обновлении и дедупликация

- [x] 8.1 Реализовать `mergeImportedJobs` и `MergeSummary`
- [x] 8.2 Сохранять `edited`, не возвращать `suppressed`, не трогать `manual`
- [x] 8.3 Удалять авто-задание при исчезнувшей дисциплине и дедуплицировать ручную и авто-пару

## 9. CLI-команда `import` и репозиторий

- [x] 9.1 Добавить необязательные `listAll`/`delete` в `JobRepository` и `SqliteJobRepository`
- [x] 9.2 Реализовать команду `import --db <path> [--auth-state] [--faculty] [--group]`
- [x] 9.3 Сохранять базу только после успешной сборки и слияния, при ошибке не менять данные

## 10. Playwright-адаптер авторизованной выборки

- [x] 10.1 Реализовать `createPlaywrightFetcher` поверх общего `storageState`
- [x] 10.2 Закрывать browser/context и не оставлять фоновых Chromium
- [x] 10.3 Покрыть валидацию отсутствующего auth state
