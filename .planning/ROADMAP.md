# Online Lecture — roadmap

### Phase 1: Автоимпорт расписания ТУСУР

**Goal:** По логину и паролю автоматически находить группу на `timetable.tusur.ru`, собирать онлайн-пары (ЭИОС), сопоставлять их с курсами SDO и создавать/обновлять задания, не изменяя ручные пары.
**Requirements:** SSO-вход и локальное хранение пароля; клиент и парсер timetable; детект ЭИОС; маппинг `course_links`; резолв BBB через MCP; модель `imported` с `edited`/`suppressed`; слияние при обновлении; ручные пары «разово»/«каждую неделю» и «Перенести»; CLI `import`.
**Plans:** 1 plan

Plans:
- [x] timetable-auto-import — ядро импорта, слияние и CLI (Tasks 1–10)

## Backlog

### Phase 999.1: Реальный lifecycle запуска лекции (BACKLOG)

**Goal:** Сделать выполнение задания устойчивым: waiting room, жёсткий `leaveAt`, повторные подключения 5/15/30 секунд, ручная остановка и корректные переходы состояний.
**Requirements:** Убрать одноразовую проверку DOM как признак завершения; выполнять переходы через автомат и атомарно сохранять их; покрыть SIGINT/SIGTERM и дедупликацию occurrence.
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with $gsd-review-backlog when ready)

### Phase 999.2: SDO MCP по утверждённому контракту (BACKLOG)

**Goal:** Подключить `resolve_online_lecture` через stdio MCP без хранения пароля и с поддержкой `SDO_AUTH_STATE_PATH`.
**Requirements:** Обработать `resolved`, `ambiguous`, `not_found` и `auth_required`; не выбирать кандидата автоматически; закрывать MCP после разрешения Moodle URL.
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with $gsd-review-backlog when ready)

### Phase 999.3: Безопасная BBB-автоматизация (BACKLOG)

**Goal:** Реализовать и проверить надёжный listen-only вход в BBB на разрешённых доменах ТУСУР.
**Requirements:** Строгий HTTPS allowlist; камера и микрофон всегда выключены; изолированные browser/context для сессий; распознавание waiting room, удаления модератором, завершения встречи и сетевого разрыва.
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with $gsd-review-backlog when ready)

### Phase 999.4: Security и quality gate (BACKLOG)

**Goal:** Сделать ветку пригодной для проверки качества и безопасной для PR.
**Requirements:** `lint`, `format:check`, `build` и `test` проходят; ошибки CLI и диагностические данные редактируются; SQLite, backup и runtime-артефакты не попадают в Git; CI закрепляет проверки.
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with $gsd-review-backlog when ready)

### Phase 999.5: Достоверные контрактные и E2E-тесты (BACKLOG)

**Goal:** Заменить source/mocks-only уверенность проверками реальных границ компонентов.
**Requirements:** Контракты SDO MCP; BBB fixtures для всех сценариев из SPEC; разрешённый ручной smoke-тест с ТУСУР; воспроизводимые тесты recovery SQLite.
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with $gsd-review-backlog when ready)

### Phase 999.6: Windows Electron пользовательское приложение (BACKLOG)

**Goal:** Реализовать сценарий нетехнического пользователя без терминала и YAML.
**Requirements:** React/Electron UI, narrow typed IPC, onboarding, управление расписаниями, история, трей, уведомления, явный autostart и удаление локального аккаунта.
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with $gsd-review-backlog when ready)

### Phase 999.7: Упаковка и Windows E2E (BACKLOG)

**Goal:** Поставлять приложение одним Windows-установщиком без внешних зависимостей.
**Requirements:** Включить Electron/Node, Chromium Playwright, SDO MCP и SQLite; проверить чистую Windows-машину, автозапуск, uninstall и восстановление после перезапуска.
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with $gsd-review-backlog when ready)

### Phase 999.8: Согласование YAML, CLI и OpenSpec (BACKLOG)

**Goal:** Сделать опубликованные конфиги и команды CLI исполнимыми на чистой машине.
**Requirements:** Устранить расхождение `url`/`direct` и `url`/`activityUrl`; обновить fixtures, README и команды; добавить немокированный smoke-тест валидного YAML, `run`, `jobs list` и повторного `run-once` на временной SQLite-базе.
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with $gsd-review-backlog when ready)
