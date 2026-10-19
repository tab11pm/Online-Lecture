# Ревью Windows-упаковки после DeepSeek

**Проверенная версия:** `68e6b94`, изменения относительно `b76e700`.

**Дата:** 2026-10-20.
**Вывод:** Linux-гейты пройдены; до Windows-приёмки нужно устранить замечания ниже. Production-код при ревью не менялся, реализация остаётся за DeepSeek.

**Обновление после ревью:** Luna 6 исправила три замечания о runtime entry-файлах, подключении executable smoke и browser profiles. Исправления прошли независимое ревью и два уточнения фильтра: легитимный `undici/lib/web/cookies` допускается, а Chromium/Edge profile trees с произвольными LevelDB-файлами отклоняются. Дополнительные замечания NSIS per-user-only и packaged browser override из этого документа в эти правки не входят и остаются открытыми. Исходное ревью ниже описывает состояние `68e6b94`; Windows-приёмка по-прежнему не выполнена.

## Замечания

### P1: Проверка пакета пропускает содержимое browser profile

`apps/desktop/scripts/packaged-app-check.ts:44` проверяет только basename; `walkFiles` вызывает проверку только для файлов, а не каталогов. Поэтому запрет `chrome-profile` не применяется к `resources/chrome-profile/Default/Cookies`: имя самого файла — `Cookies`, а родительский каталог не проверяется.

Воспроизведено на полностью синтетическом пакете: после добавления `resources/chrome-profile/Default/Cookies` с тестовым текстом `verifyPackagedApplication` успешно возвращает результат. Реальные cookies не использовались и не обнаруживались. Это обход обязательного gate приватности, а не утверждение об утечке из уже выпущенного установщика.

Нужно проверять запрещённые компоненты путей/каталоги и содержимое профилей как в ASAR, так и вне него. Регрессия должна отклонять именно файл внутри профиля, а не лишь файл с именем `chrome-profile`.

### P2: Manifests зависимостей принимаются без runtime entry-файлов

`apps/desktop/scripts/packaged-app-check.ts:169` читает manifests и обходит `dependencies`, но не проверяет наличие обязательных исполняемых entry-файлов MCP/Playwright. Набор обязательных ASAR entries покрывает только собственный код приложения.

Воспроизведено: пакет с manifests `sdo_mcp` и `playwright`, но без `sdo_mcp/dist/index.js` и `playwright/cli.js`, успешно проходит `verifyPackagedApplication`. Его synthetic PE и SHA соответствовали условиям проверки; отсутствовали именно runtime-файлы. Сейчас такой gate не предотвращает сборку NSIS из неполного runtime.

Нужны проверки реальных entry/CLI и регрессии их удаления. Проверку manifests следует сохранить, но она не заменяет проверку файлов.

### P2: Executable runtime smoke не подключён к исполняемому сценарию

`apps/desktop/scripts/packaged-runtime-smoke.ts:204` экспортирует `smokePackagedRuntime`, но не имеет CLI entrypoint. Его единственные вызовы — unit-тесты `apps/desktop/tests/packaging/packaged-runtime.test.ts` с подменёнными `runChild`/`handshake`. Packaged E2E `apps/desktop/tests/e2e/packaged-runtime.test.ts:11` проверяет только `app.isPackaged` и приветствие; четыре переиспользованных UI-сценария используют fake adapters и не запускают настоящий MCP.

Следовательно, указанные E2E-команды не выполняют настоящий MCP-handshake/Playwright CLI через упакованный Electron. Нужно вызвать smoke из явного opt-in packaged-теста либо добавить документированный CLI, требующий абсолютный путь к настоящему exe. В этом сценарии убрать developer Node из PATH, не только NODE_PATH; тестировать timeout/cleanup. Нельзя закрывать 5.1 только по mocked unit-тестам.

### P2: Assisted NSIS не ограничен только текущим пользователем

В `apps/desktop/electron-builder.yml:39` заданы `oneClick: false`, `perMachine: false`, `allowElevation: false`. Для assisted NSIS такое сочетание оставляет страницу выбора режима, а `allowElevation: false` лишь запрещает запрос повышения прав. В установленном шаблоне `multiUserUi.nsh` выбор all-users остаётся доступным, если процесс уже запущен администратором. Такое поведение также описано в [документации electron-builder 26](https://www.electron.build/v26/docs/nsis/).

Нужно явно обеспечить per-user-only поведение, в том числе для уже elevated запуска и аргументов установщика. Существующий `installer.nsh` содержит только `customUnInstall`, ограничения install mode нет. В согласованном плане сочетание опций также было недостаточным: при исправлении ориентироваться на требование per-user из дизайна, а не сохранять ошибку плана. Фактическая проверка на Windows ещё обязательна.

### P2: Packaged-выбор браузера всё ещё переопределяется внешним channel

`apps/desktop/src/main/index.ts:48` захватывает `process.env.SDO_BROWSER_CHANNEL` независимо от `runtimeMode`, затем передаёт его controller/worker. План Task 1 требует захватывать этот override только в development.

Проверено через реальные runtime-policy и BrowserController с синтетическим окружением: packaged mode, сохранённый `browser='chromium'`, установленный Chromium и унаследованный `SDO_BROWSER_CHANNEL='msedge'` дают одновременно `choice='chromium'` и `externalChannel='msedge'`. Provider отдаёт приоритет externalChannel, поэтому GUI-выбор не определяет запускаемый браузер.

Нужен guard по runtimeMode и регрессия packaged startup с внешним `msedge` и сохранённым Chromium; development override должен сохраниться.

## Фактически выполненные проверки

- `npm test`: итоговый последовательный прогон — 328 core + 401 desktop PASS, пять opt-in SKIP.
- Первый прогон параллельно со сборкой дал таймаут `offers Chromium installation from the credentials screen` (`readyRadio`, renderer onboarding). Отдельно весь файл прошёл 23/23; повторный desktop-набор и итоговый `npm test` прошли. Стабильная регрессия не установлена, renderer-код в диапазоне ревью не менялся.
- `npm run build` и `npm run build -w @online-lecture/desktop` — PASS.
- `PLAYWRIGHT_BROWSERS_PATH=/tmp/online-lecture-playwright-browsers CI_ELECTRON_E2E=1 npm test -w @online-lecture/desktop -- tests/e2e` — четыре dev Electron сценария PASS, Windows packaged case SKIP. Использован ранее установленный Chromium/headless shell 1243; браузеры заново не скачивались.
- Два негативных package probes выполнены отдельным временным script с реальным ASAR и синтетическими PE/данными; fixtures удалены после проверки. Исходные тесты проекта и production-код не изменялись.

## Не проверено

Windows build/NSIS, настоящий `OnlineLecture.exe`, packaged runtime smoke, Edge/DPAPI/уведомления/автозапуск, установка/обновление/uninstall. Реальные ТУСУР/SSO/BBB не использовались. Неотслеживаемый `online-lecture-source.zip` не открывался, не удалялся и не включался в изменения ревью.
