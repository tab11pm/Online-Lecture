# Desktop preview screenshots

Скриншоты для ревью интерфейса сделаны 2026-10-20 из встроенного preview на синтетических сценариях. Реальная учётная запись, браузерная сессия и системы ТУСУР не использовались. Это изображения renderer, а не подтверждение запуска установленного приложения на Windows.

Запуск из корня репозитория:

```sh
npm run preview -w @online-lecture/desktop -- --host 127.0.0.1
```

| Файл                         | Preview URL                                                             |
| ---------------------------- | ----------------------------------------------------------------------- |
| `desktop-schedule-light.png` | `http://127.0.0.1:5190/preview.html?screen=schedule&theme=light&dock=0` |
| `desktop-schedule-dark.png`  | `http://127.0.0.1:5190/preview.html?screen=schedule&theme=dark&dock=0`  |
| `desktop-journal-light.png`  | `http://127.0.0.1:5190/preview.html?screen=journal&theme=light&dock=0`  |
| `desktop-welcome-light.png`  | `http://127.0.0.1:5190/preview.html?screen=welcome&theme=light&dock=0`  |

Viewport: 1280 × 900, device scale 1, full-page capture, локальные шрифты загружены. Исходный renderer соответствует `74083c2`; последующее включение `origin/main` не изменило дерево файлов приложения.
