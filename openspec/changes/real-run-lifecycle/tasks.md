## 1. OpenSpec

- [x] 1.1 Описать требования через `ADDED Requirements`, `Requirement:` и `Scenario:`; использовать существующие статусы и причины завершения.
- [x] 1.2 Проверить change командой `openspec validate real-run-lifecycle --strict`.

## 2. Контроллер и граница порта

- [x] 2.1 Добавить типы наблюдений и браузерный порт в `src/core/types.ts`, контроллер в `src/core/lecture-session-controller.ts` и нормальное завершение через сохранённые переходы. Тест: `tests/core/lecture-session-controller.test.ts`. Проверка: `npm test -- tests/core/lecture-session-controller.test.ts`
- [x] 2.2 Добавить deadline до каждой операции и во время ожидания, отмену, очистку и соответствующие переходы в `src/core/lifecycle.ts`. Проверить waiting-room, connected, deadline во время retry и предварительную отмену. Тест: `tests/core/lecture-session-controller.test.ts`. Проверка: `npm test -- tests/core/lecture-session-controller.test.ts`
- [x] 2.3 Реализовать повторы 5/15/30 секунд, четвёртую ошибку как `failed` с `error`, положительное удаление модератором как `blocked` без повторов, непрерывное наблюдение и идемпотентную очистку. Тест: `tests/core/lecture-session-controller.test.ts`. Проверка: `npm test -- tests/core/lecture-session-controller.test.ts`

## 3. BBB-адаптер

- [x] 3.1 Записать подтверждённые несекретные селекторы или доступный текст и ожидаемые наблюдения в `tests/fixtures/bbb-lifecycle/`; оставить неподтверждённые waiting-room, meeting-ended и moderator-removal сигналы неподдерживаемыми. Проверить адаптер локальными DOM-фикстурами. Тест: `tests/core/bbb-session.test.ts`. Проверка: `npm test -- tests/core/bbb-session.test.ts`
- [x] 3.2 Реализовать однократное наблюдение в `src/core/bbb-session.ts`, уважая abort, приоритет подтверждённых сигналов и технические ошибки; исключить вывод об удалении по отсутствующему DOM. Проверить отключение камеры/микрофона при каждом join/reconnect и очистку. Тест: `tests/core/bbb-session.test.ts`. Проверка: `npm test -- tests/core/bbb-session.test.ts`

## 4. Интеграция и отмена CLI

- [x] 4.1 Подключить контроллер к `src/core/job-runner.ts`, передать occurrence, port и зависимости, сохранить каждый переход и терминальный результат, дождаться очистки. Тест: `tests/core/job-runner.test.ts`. Проверка: `npm test -- tests/core/job-runner.test.ts`
- [x] 4.2 Добавить обработчики SIGINT/SIGTERM в `src/cli/index.ts`, передающие abort активному запуску без преждевременного выхода процесса; проверить снятие обработчиков и завершение с `manual` после закрытия браузера. Тест: `tests/core/job-runner.test.ts`. Проверка: `npm test -- tests/core/job-runner.test.ts`

## 5. Итоговая проверка

- [x] 5.1 Выполнить `npm test`, `npm run build` и `openspec validate real-run-lifecycle --strict`; подтвердить отсутствие секретов и зависимости от живой BBB-сессии.
