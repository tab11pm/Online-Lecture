# Автоимпорт расписания ТУСУР — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать приложению возможность по логину/паролю автоматически найти группу на `timetable.tusur.ru`, собрать онлайн-пары (ЭИОС), сопоставить их с курсами SDO и создать/обновить задания в SQLite, не изменяя ручные пары.

**Architecture:** Новый пакет `src/timetable/` в ядре: чистые парсеры HTML/JSON, `TimetableClient` поверх порта `HttpFetcher`, импортёр, зависящий от порта `OnlineLectureResolver`, и чистая функция слияния. Реальная авторизованная выборка — Playwright-адаптер поверх того же порта. Всё тестируется на фикстурах без сети.

**Tech Stack:** TypeScript (ESM), vitest, jsdom, luxon, zod, better-sqlite3, cli commander, Playwright (только адаптер).

**Spec:** `docs/superpowers/specs/2026-10-02-timetable-auto-import-design.md`

## Scope

Этот план покрывает фазы 1–2 дизайна: ядро импорта, слияние и CLI-команду `import`.
Он **не** включает SSO-вход в `profile.tusur.ru`, хранение пароля, Electron UI,
трей и Windows-упаковку (фазы 3–4) — для них будут отдельные планы. Для ручного
smoke на этом этапе используется готовый Playwright storage state (`--auth-state`).

## Global Constraints

- Язык — TypeScript, ESM, 2 пробела, `camelCase` для значений, `PascalCase` для классов, `kebab-case` для имён файлов.
- Все тесты — vitest; имена по наблюдаемому поведению (`does-...test.ts`).
- Дефолтный часовой пояс расписания — `Asia/Tomsk` (+07).
- Никаких живых вызовов ТУСУР в тестах; только обезличенные фикстуры.
- Никогда не коммитить сессии, cookies, SQLite, персональные данные студентов.
- Проверки перед завершением: `npm run build`, `npm test`, `npm run lint`, `npm run format:check`.
- `Job.source` и `Job.origin` — необязательные (старые задания без `source` считаются `manual`).
- `listAll`/`delete` в `JobRepository` — необязательные методы, чтобы не ломать существующие фейки.

## Review Focus

- Полное имя дисциплины, а не аббревиатура `abbr` — иначе маппинг на курс SDO ломается.
- `suppressed`-вхождения не должны возвращаться после обновления расписания.
- Ручные пары (`source: manual`) не должны изменяться или удаляться обновлением.
- Дедупликация ручной и авто-пары по (дата, время, дисциплина) — один вход, не два.
- Повреждённая/незнакомая разметка не должна портить уже сохранённое расписание.

---

### Task 1: Модель данных — `imported` расписание и источник задания

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/occurrence.ts`
- Modify: `src/core/index.ts`
- Modify: `tests/contracts/public-api.ts`
- Test: `tests/core/imported-occurrence.test.ts`

**Interfaces:**
- Consumes: существующие `Job`, `Schedule`, `Occurrence`, `Course`, `LectureTarget`, `findActiveOccurrence`.
- Produces: `ImportedOccurrence`, `JobSource`, `JobOrigin`, `schedule.type === 'imported'`, `OnlineLectureCandidate`, `OnlineLectureResolution`, `OnlineLectureResolver`.

- [ ] **Step 1: Написать падающий тест `tests/core/imported-occurrence.test.ts`**

```ts
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { findActiveOccurrence } from '../../src/core/occurrence.js';
import type { Job } from '../../src/core/types.js';

const importedJob: Job = {
  id: 'tt:fvs:574-1:22413',
  enabled: true,
  source: 'timetable',
  origin: { faculty: 'fvs', group: '574-1', discipline: 'РМП2', sdoCourseId: '22413' },
  schedule: {
    type: 'imported',
    timezone: 'Asia/Tomsk',
    occurrences: [
      { date: '2026-09-30', joinAt: '13:15', leaveAt: '14:50' },
      { date: '2026-10-07', joinAt: '13:15', leaveAt: '14:50', suppressed: true },
    ],
  },
  target: { type: 'search', courseId: '22413', courseName: 'РМП2' },
  browser: { headless: true },
};

describe('findActiveOccurrence for imported schedule', () => {
  it('returns the matching dated occurrence', () => {
    const now = DateTime.fromISO('2026-09-30T13:20:00+07:00').toJSDate();
    expect(findActiveOccurrence(importedJob, now)).toMatchObject({
      id: 'tt:fvs:574-1:22413:2026-09-30T13:15:00.000+07:00',
      jobId: 'tt:fvs:574-1:22413',
      joinAt: '2026-09-30T13:15:00.000+07:00',
      leaveAt: '2026-09-30T14:50:00.000+07:00',
      timezone: 'Asia/Tomsk',
    });
  });

  it('does not return a suppressed occurrence', () => {
    const now = DateTime.fromISO('2026-10-07T13:20:00+07:00').toJSDate();
    expect(findActiveOccurrence(importedJob, now)).toBeUndefined();
  });

  it('does not return on a date without an occurrence', () => {
    const now = DateTime.fromISO('2026-10-01T13:20:00+07:00').toJSDate();
    expect(findActiveOccurrence(importedJob, now)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npx vitest run tests/core/imported-occurrence.test.ts`
Expected: FAIL — `'imported'` не входит в union `Schedule`.

- [ ] **Step 3: Добавить типы в `src/core/types.ts`**

```ts
export type JobSource = 'manual' | 'timetable';

export interface JobOrigin {
  faculty: string;
  group: string;
  discipline: string;
  sdoCourseId: string;
}

export interface ImportedOccurrence {
  date: string;      // YYYY-MM-DD
  joinAt: string;    // HH:MM
  leaveAt: string;   // HH:MM
  room?: string;
  edited?: boolean;
  suppressed?: boolean;
}
```

Добавить в union `Schedule` третий вариант:

```ts
  | {
      type: 'imported';
      timezone: string;
      occurrences: ImportedOccurrence[];
    };
```

Добавить в `Job`:

```ts
  source?: JobSource;
  origin?: JobOrigin;
```

Добавить MCP-порт резолва (рядом с `BbbActivity`):

```ts
export interface OnlineLectureCandidate {
  id: string;
  name: string;
  courseUrl: string;
  activityUrl: string;
  type: 'lecture' | 'practical';
}

export type OnlineLectureResolution =
  | { status: 'resolved'; course: Course; module: OnlineLectureCandidate }
  | { status: 'ambiguous'; candidates: OnlineLectureCandidate[] }
  | { status: 'not_found' }
  | { status: 'auth_required' };

export interface OnlineLectureResolver {
  resolveOnlineLecture(input: {
    courseUrl?: string;
    courseQuery?: string;
    lectureQuery?: string;
  }): Promise<OnlineLectureResolution>;
}
```

- [ ] **Step 4: Добавить ветку `imported` в `src/core/occurrence.ts`**

После обработки `weekly` и до вычисления `joinAt`: если `schedule.type === 'imported'`, найти первое вхождение из `schedule.occurrences` с `date === localDate` и без `suppressed`; если нет — вернуть `undefined`; использовать его `joinAt`/`leaveAt`. Существующая нижняя часть (окно `[joinAt, leaveAt)`, `id = \`${job.id}:${joinAtIso}\``) не меняется. Чтобы не дублировать код, вынести выбор `{ joinAt, leaveAt }` для типа `imported` и продолжить общий путь.

- [ ] **Step 5: Обновить `src/core/index.ts`**

Экспортировать новые типы из `./types.js`: `ImportedOccurrence`, `JobSource`, `JobOrigin`, `OnlineLectureCandidate`, `OnlineLectureResolution`, `OnlineLectureResolver`.

- [ ] **Step 6: Обновить `tests/contracts/public-api.ts`**

Добавить `const imported: Job = { ... source: 'timetable', schedule: { type: 'imported', ... } }` и `const resolution: OnlineLectureResolution = { status: 'not_found' }`, затем `void imported; void resolution;`.

- [ ] **Step 7: Запустить тесты**

Run: `npx vitest run tests/core/imported-occurrence.test.ts tests/contracts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/core/types.ts src/core/occurrence.ts src/core/index.ts tests/core/imported-occurrence.test.ts tests/contracts/public-api.ts
git commit -m "feat: add imported schedule model and online lecture resolver port"
```

---

### Task 2: Парсер HTML — группа, недели, онлайн-пары (ЭИОС)

**Files:**
- Create: `src/timetable/types.ts`
- Create: `src/timetable/timetable-parser.ts`
- Test: `tests/timetable/timetable-parser.test.ts`
- Test fixtures: `tests/fixtures/timetable/home.html`, `tests/fixtures/timetable/group-week.html`

**Interfaces:**
- Consumes: `JSDOM` из `jsdom`.
- Produces: `ParsedLesson`, `discoverMyScheduleHref`, `parseFacultyAndGroup`, `parseWeekIds`, `parseLessons`.

- [ ] **Step 1: Создать фикстуры**

`tests/fixtures/timetable/home.html` — минимальный, но воспроизводящий структуру: `<a href="http://timetable.tusur.ru/faculties/fvs/groups/574-1">Мое расписание</a>`.

`tests/fixtures/timetable/group-week.html` — таблица `<table><tbody>` с двумя `tr`:
- строка дня с `пн, 28 сент.`, слот `13:15`/`14:50` и блоком `training training_type_lecture`, где `<abbr title="Правовые основы профессиональной деятельности">ПОПД</abbr>`, `.kind` = «Лекция», `.auditoriums` = `гк 411`, `data-lesson-id="1"`, без пометки ЭИОС;
- строка дня с `ср, 30 сент.`, слот `13:15`/`14:50` и блоком `training training_type_lecture` с `data-lesson-id="2"`, `<span class="note">реализуется в ЭИОС</span>`, пустыми `.auditoriums`.
Дисциплины и преподаватели — вымышленные.

- [ ] **Step 2: Написать падающий тест `tests/timetable/timetable-parser.test.ts`**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  discoverMyScheduleHref,
  parseFacultyAndGroup,
  parseLessons,
  parseWeekIds,
} from '../../src/timetable/timetable-parser.js';

const home = readFileSync('tests/fixtures/timetable/home.html', 'utf8');
const week = readFileSync('tests/fixtures/timetable/group-week.html', 'utf8');

describe('timetable parser', () => {
  it('finds the personal schedule link and splits faculty and group', () => {
    const href = discoverMyScheduleHref(home);
    expect(href).toBe('http://timetable.tusur.ru/faculties/fvs/groups/574-1');
    expect(parseFacultyAndGroup(href!)).toEqual({ faculty: 'fvs', group: '574-1' });
  });

  it('collects unique sorted week ids', () => {
    expect(parseWeekIds('<a href="/fvs/groups/574-1?week_id=841"></a><a href="/fvs/groups/574-1?week_id=839"></a><a href="/fvs/groups/574-1?week_id=839"></a>'))
      .toEqual([839, 841]);
  });

  it('parses lessons and uses the full discipline name, not the abbreviation', () => {
    const lessons = parseLessons(week, { year: 2026 });
    expect(lessons).toHaveLength(2);
    expect(lessons[0]).toMatchObject({
      lessonId: '1',
      discipline: 'Правовые основы профессиональной деятельности',
      kind: 'Лекция',
      date: '2026-09-28',
      start: '13:15',
      end: '14:50',
      room: 'гк 411',
      online: false,
    });
    expect(lessons[1]).toMatchObject({
      lessonId: '2',
      date: '2026-09-30',
      online: true,
    });
  });
});
```

- [ ] **Step 3: Запустить тест и убедиться, что он падает**

Run: `npx vitest run tests/timetable/timetable-parser.test.ts`
Expected: FAIL — модуль `timetable-parser` не найден.

- [ ] **Step 4: Создать `src/timetable/types.ts`**

```ts
export interface ParsedLesson {
  lessonId: string;
  discipline: string; // полное имя
  kind: string;       // "Лекция"
  date: string;       // YYYY-MM-DD
  start: string;      // HH:MM
  end: string;        // HH:MM
  room?: string;
  online: boolean;    // "реализуется в ЭИОС"
}
```

- [ ] **Step 5: Реализовать `src/timetable/timetable-parser.ts`**

- `discoverMyScheduleHref(html)`: через `new JSDOM(html)`, найти `<a>`, чей `textContent` содержит `Мое расписание` или `Моё расписание`; вернуть `href` или `undefined`.
- `parseFacultyAndGroup(href)`: разобрать регуляркой `/faculties/([^/]+)/groups/([^/?#]+)/`; при несовпадении вернуть `undefined`.
- `parseWeekIds(html)`: собрать все вхождения `week_id=(\d+)` в множество, вернуть отсортированный массив чисел.
- `parseLessons(html, options)`: `JSDOM`, выбрать основную таблицу с `.training`; пройти по `tr`; дату взять из первого `td` через `(\d{1,2})\s+([а-я]+)`. и карту месяцев (`янв..дек` -> `01..12`); для каждого `td` со слотами читать два `span` как `start`/`end`, внутри найти `.training`; дисциплина = `abbr[title]` `title` либо текст `.discipline`; `kind` = `.kind`; `room` = текст `.auditoriums` (trim, пусто -> `undefined`); `online` = текст блока содержит `ЭИОС`; `lessonId` = `[data-lesson-id]`. Дедуплицировать по `lessonId`. Вернуть массив.

- [ ] **Step 6: Запустить тест**

Run: `npx vitest run tests/timetable/timetable-parser.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/timetable/types.ts src/timetable/timetable-parser.ts tests/timetable/timetable-parser.test.ts tests/fixtures/timetable
git commit -m "feat: parse timetable group page and EIOS online lessons"
```

---

### Task 3: Маппинг `course_links` -> SDO-курс

**Files:**
- Create: `src/timetable/course-mapper.ts`
- Test: `tests/timetable/course-mapper.test.ts`
- Test fixture: `tests/fixtures/timetable/course-links.json`

**Interfaces:**
- Consumes: ничего из предыдущих задач.
- Produces: `CourseLink`, `parseCourseLinks`, `extractSdoCourseId`, `buildCourseUrl`.

- [ ] **Step 1: Создать фикстуру `tests/fixtures/timetable/course-links.json`**

```json
[{ "url": "https://sdo.tusur.ru/auth/edu?id=22413", "anchor": "Журнал (гр. 574-1)", "group": "574-1" }]
```

- [ ] **Step 2: Написать падающий тест `tests/timetable/course-mapper.test.ts`**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCourseUrl, extractSdoCourseId, parseCourseLinks } from '../../src/timetable/course-mapper.js';

const json = readFileSync('tests/fixtures/timetable/course-links.json', 'utf8');

describe('course mapper', () => {
  it('parses links and extracts the SDO course id', () => {
    const links = parseCourseLinks(json);
    expect(links).toHaveLength(1);
    expect(extractSdoCourseId(links[0]!)).toBe('22413');
  });

  it('returns an empty list for an empty or malformed payload', () => {
    expect(parseCourseLinks('[]')).toEqual([]);
    expect(parseCourseLinks('not json')).toEqual([]);
  });

  it('returns undefined when the url has no id', () => {
    expect(extractSdoCourseId({ url: 'https://sdo.tusur.ru/auth/edu', anchor: '', group: '' })).toBeUndefined();
  });

  it('builds a Moodle course url', () => {
    expect(buildCourseUrl('22413')).toBe('https://sdo.tusur.ru/course/view.php?id=22413');
  });
});
```

- [ ] **Step 3: Запустить тест и убедиться, что он падает**

Run: `npx vitest run tests/timetable/course-mapper.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 4: Реализовать `src/timetable/course-mapper.ts`**

```ts
export interface CourseLink { url: string; anchor: string; group: string; }
export function parseCourseLinks(json: string): CourseLink[];
export function extractSdoCourseId(link: CourseLink): string | undefined;
export function buildCourseUrl(sdoCourseId: string): string;
```

`parseCourseLinks` — `JSON.parse` в try/catch, проверить, что это массив объектов с `url: string`, иначе вернуть `[]`. `extractSdoCourseId` — `new URL(link.url)`, взять `searchParams.get('id') ?? undefined`. `buildCourseUrl` — строка `` `https://sdo.tusur.ru/course/view.php?id=${sdoCourseId}` ``.

- [ ] **Step 5: Запустить тест**

Run: `npx vitest run tests/timetable/course-mapper.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/timetable/course-mapper.ts tests/timetable/course-mapper.test.ts tests/fixtures/timetable/course-links.json
git commit -m "feat: map timetable lessons to SDO course links"
```

---

### Task 4: `TimetableClient` поверх порта `HttpFetcher`

**Files:**
- Create: `src/timetable/http-fetcher.ts`
- Create: `src/timetable/timetable-client.ts`
- Test: `tests/timetable/timetable-client.test.ts`

**Interfaces:**
- Consumes: `ParsedLesson`, `discoverMyScheduleHref`, `parseFacultyAndGroup`, `parseWeekIds`, `parseLessons`, `CourseLink`, `parseCourseLinks`.
- Produces: `HttpFetcher`, `TimetableClient` с `discoverGroup()`, `fetchWeekIds()`, `fetchLessons()`, `fetchCourseLinks()`, `fetchOnlineLessons()`.

- [ ] **Step 1: Написать падающий тест `tests/timetable/timetable-client.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { TimetableClient } from '../../src/timetable/timetable-client.js';
import type { HttpFetcher } from '../../src/timetable/http-fetcher.js';

function fetcher(routes: Record<string, string>): HttpFetcher {
  return { get: async (url) => routes[url] ?? routes[new URL(url).pathname] ?? '' };
}

describe('TimetableClient', () => {
  it('discovers faculty and group from the authenticated home page', async () => {
    const client = new TimetableClient({
      fetcher: fetcher({ '/': '<a href="/faculties/fvs/groups/574-1">Мое расписание</a>' }),
      baseUrl: 'https://timetable.tusur.ru',
      year: 2026,
    });
    await expect(client.discoverGroup()).resolves.toEqual({ faculty: 'fvs', group: '574-1' });
  });

  it('collects only online lessons across weeks and deduplicates by lessonId', async () => {
    const client = new TimetableClient({
      fetcher: fetcher({
        '/faculties/fvs/groups/574-1': '<a href="?week_id=839"></a><a href="?week_id=840"></a>',
        '/faculties/fvs/groups/574-1?week_id=839': '<tr><td>ср, 30 сент.</td><td><span>13:15</span><span>14:50</span><div class="training training_type_lecture"><span class="discipline" data-lesson-id="9">РВП</span><span class="kind">Лекция</span><span class="note">реализуется в ЭИОС</span></div></td></tr>',
        '/faculties/fvs/groups/574-1?week_id=840': '<tr><td>пн, 05 окт.</td><td><span>13:15</span><span>14:50</span><div class="training training_type_lecture"><span class="discipline" data-lesson-id="9">РВП</span><span class="kind">Лекция</span><span class="note">реализуется в ЭИОС</span></div></td></tr>',
      }),
      baseUrl: 'https://timetable.tusur.ru',
      year: 2026,
    });
    const lessons = await client.fetchOnlineLessons('fvs', '574-1');
    expect(lessons.map((l) => l.lessonId)).toEqual(['9']);
  });

  it('parses course links for a lesson', async () => {
    const client = new TimetableClient({
      fetcher: fetcher({ '/ocenka/api/v1/lessons/9/course_links': '[{"url":"https://sdo.tusur.ru/auth/edu?id=22414","anchor":"a","group":"574-1"}]' }),
      baseUrl: 'https://timetable.tusur.ru',
      year: 2026,
    });
    await expect(client.fetchCourseLinks('9')).resolves.toHaveLength(1);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npx vitest run tests/timetable/timetable-client.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Создать `src/timetable/http-fetcher.ts`**

```ts
export interface HttpFetcher {
  get(url: string): Promise<string>;
}
```

- [ ] **Step 4: Реализовать `src/timetable/timetable-client.ts`**

```ts
export interface TimetableClientOptions {
  fetcher: HttpFetcher;
  baseUrl?: string; // default https://timetable.tusur.ru
  year?: number;    // default new Date().getFullYear()
}
export class TimetableClient {
  constructor(options: TimetableClientOptions);
  discoverGroup(): Promise<{ faculty: string; group: string }>;
  fetchWeekIds(faculty: string, group: string): Promise<number[]>;
  fetchLessons(faculty: string, group: string, weekId: number): Promise<ParsedLesson[]>;
  fetchCourseLinks(lessonId: string): Promise<CourseLink[]>;
  fetchOnlineLessons(faculty: string, group: string): Promise<ParsedLesson[]>;
}
```

`fetchOnlineLessons`: получить weekIds, для каждой недели `fetchLessons`, отфильтровать `online`, дедуплицировать по `lessonId`. `discoverGroup` бросает `new Error('Personal schedule link not found')`, если ссылки нет. Пути: `/`, `/faculties/<f>/groups/<g>`, `/faculties/<f>/groups/<g>?week_id=<n>`, `/ocenka/api/v1/lessons/<id>/course_links`.

- [ ] **Step 5: Запустить тест**

Run: `npx vitest run tests/timetable/timetable-client.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/timetable/http-fetcher.ts src/timetable/timetable-client.ts tests/timetable/timetable-client.test.ts
git commit -m "feat: add timetable client over http fetcher port"
```

---

### Task 5: Группировка онлайн-дисциплин по курсам SDO

**Files:**
- Create: `src/timetable/online-selector.ts`
- Test: `tests/timetable/online-selector.test.ts`

**Interfaces:**
- Consumes: `ParsedLesson`, `CourseLink`, `parseCourseLinks`, `extractSdoCourseId`.
- Produces: `OnlineDiscipline`, `groupOnlineDisciplines`.

- [ ] **Step 1: Написать падающий тест `tests/timetable/online-selector.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { groupOnlineDisciplines } from '../../src/timetable/online-selector.js';
import type { ParsedLesson } from '../../src/timetable/types.js';

const lesson = (over: Partial<ParsedLesson>): ParsedLesson => ({
  lessonId: '1',
  discipline: 'РМП2',
  kind: 'Лекция',
  date: '2026-09-30',
  start: '13:15',
  end: '14:50',
  online: true,
  ...over,
});

describe('groupOnlineDisciplines', () => {
  it('groups lessons of one discipline under its SDO course id', async () => {
    const fetchLinks = vi.fn().mockResolvedValue([
      { url: 'https://sdo.tusur.ru/auth/edu?id=22413', anchor: 'a', group: '574-1' },
    ]);
    const result = await groupOnlineDisciplines(
      [lesson({}), lesson({ lessonId: '2', date: '2026-10-07' })],
      fetchLinks,
    );
    expect(result.disciplines).toHaveLength(1);
    expect(result.disciplines[0]).toMatchObject({ discipline: 'РМП2', sdoCourseId: '22413' });
    expect(result.disciplines[0]!.lessons).toHaveLength(2);
    expect(fetchLinks).toHaveBeenCalledTimes(1); // кэш по дисциплине
  });

  it('reports lessons whose course link cannot be resolved', async () => {
    const result = await groupOnlineDisciplines([lesson({ lessonId: '7' })], async () => []);
    expect(result.disciplines).toEqual([]);
    expect(result.unresolved.map((l) => l.lessonId)).toEqual(['7']);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npx vitest run tests/timetable/online-selector.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать `src/timetable/online-selector.ts`**

```ts
export interface OnlineDiscipline {
  discipline: string;
  sdoCourseId: string;
  lessons: ParsedLesson[];
}
export async function groupOnlineDisciplines(
  lessons: ParsedLesson[],
  fetchCourseLinks: (lessonId: string) => Promise<CourseLink[]>,
): Promise<{ disciplines: OnlineDiscipline[]; unresolved: ParsedLesson[] }>;
```

Пройти по занятиям, для каждой дисциплины взять первый `course_links` и закэшировать `discipline -> sdoCourseId`; если id нет — добавить занятие в `unresolved`. Сгруппировать остальные по дисциплине.

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/timetable/online-selector.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/timetable/online-selector.ts tests/timetable/online-selector.test.ts
git commit -m "feat: group online lessons by SDO course"
```

---

### Task 6: Импортёр — построение заданий из онлайн-дисциплин

**Files:**
- Create: `src/timetable/timetable-importer.ts`
- Test: `tests/timetable/timetable-importer.test.ts`

**Interfaces:**
- Consumes: `OnlineDiscipline`, `OnlineLectureResolver`, `buildCourseUrl`, `Job`, `ImportedOccurrence`.
- Produces: `ImportedBuildResult`, `buildImportedJobs({ faculty, group, disciplines, resolver, timezone? })`.

- [ ] **Step 1: Написать падающий тест `tests/timetable/timetable-importer.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { buildImportedJobs } from '../../src/timetable/timetable-importer.js';
import type { OnlineLectureResolver, OnlineLectureResolution } from '../../src/core/types.js';

const discipline = {
  discipline: 'РМП2',
  sdoCourseId: '22413',
  lessons: [
    { lessonId: '1', discipline: 'РМП2', kind: 'Лекция', date: '2026-09-30', start: '13:15', end: '14:50', online: true },
    { lessonId: '2', discipline: 'РМП2', kind: 'Лабораторная работа', date: '2026-10-07', start: '10:40', end: '12:15', online: true, room: 'ф 226' },
  ],
};

const resolver = (result: OnlineLectureResolution): OnlineLectureResolver => ({
  resolveOnlineLecture: vi.fn().mockResolvedValue(result),
});

describe('buildImportedJobs', () => {
  it('builds a timetable job with dated occurrences for a resolved lecture', async () => {
    const result = await buildImportedJobs({
      faculty: 'fvs',
      group: '574-1',
      disciplines: [discipline],
      resolver: resolver({
        status: 'resolved',
        course: { id: '22413', name: 'РМП2' },
        module: { id: 'm1', name: 'Онлайн-лекция', courseUrl: 'https://sdo.tusur.ru/course/view.php?id=22413', activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=1', type: 'lecture' },
      }),
    });
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      id: 'tt:fvs:574-1:22413',
      source: 'timetable',
      origin: { faculty: 'fvs', group: '574-1', discipline: 'РМП2', sdoCourseId: '22413' },
      target: { type: 'direct', activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=1' },
      schedule: {
        type: 'imported',
        occurrences: [
          { date: '2026-09-30', joinAt: '13:15', leaveAt: '14:50' },
          { date: '2026-10-07', joinAt: '10:40', leaveAt: '12:15', room: 'ф 226' },
        ],
      },
    });
  });

  it('reports not_found and ambiguous disciplines separately', async () => {
    const notFound = await buildImportedJobs({ faculty: 'fvs', group: '574-1', disciplines: [discipline], resolver: resolver({ status: 'not_found' }) });
    expect(notFound.jobs).toEqual([]);
    expect(notFound.unresolved).toHaveLength(1);

    const ambiguous = await buildImportedJobs({ faculty: 'fvs', group: '574-1', disciplines: [discipline], resolver: resolver({ status: 'ambiguous', candidates: [] }) });
    expect(ambiguous.ambiguous).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npx vitest run tests/timetable/timetable-importer.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать `src/timetable/timetable-importer.ts`**

```ts
export interface ImportedBuildResult {
  jobs: Job[];
  unresolved: OnlineDiscipline[];
  ambiguous: OnlineDiscipline[];
  authRequired: boolean;
}
export async function buildImportedJobs(input: {
  faculty: string;
  group: string;
  disciplines: OnlineDiscipline[];
  resolver: OnlineLectureResolver;
  timezone?: string; // default 'Asia/Tomsk'
}): Promise<ImportedBuildResult>;
```

Для каждой дисциплины: `resolver.resolveOnlineLecture({ courseUrl: buildCourseUrl(sdoCourseId) })`.
- `resolved` -> `Job` c `id: \`tt:${faculty}:${group}:${sdoCourseId}\``, `enabled: true`, `source: 'timetable'`, `origin`, `target: { type: 'direct', activityUrl: module.activityUrl }`, `schedule: { type: 'imported', timezone, occurrences }` где `occurrences = lessons.map(l => ({ date: l.date, joinAt: l.start, leaveAt: l.end, ...(l.room ? { room: l.room } : {}) }))`, `browser: { headless: false }`.
- `not_found` -> в `unresolved`.
- `ambiguous` -> в `ambiguous`.
- `auth_required` -> `authRequired = true` (дисциплина не добавляется в jobs).

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/timetable/timetable-importer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/timetable/timetable-importer.ts tests/timetable/timetable-importer.test.ts
git commit -m "feat: build imported jobs from resolved online lectures"
```

---

### Task 7: `resolveOnlineLecture` в `SdoMcpClient`

**Files:**
- Modify: `src/core/mcp-client.ts`
- Test: `tests/core/mcp-client.test.ts`

**Interfaces:**
- Consumes: `OnlineLectureResolution`, `OnlineLectureResolver` из Task 1.
- Produces: `SdoMcpClient.resolveOnlineLecture(input)`; `SdoMcpClient implements OnlineLectureResolver`.

- [ ] **Step 1: Дописать падающий тест в `tests/core/mcp-client.test.ts`**

```ts
it('returns the resolver payload from the MCP server', async () => {
  const c = new SdoMcpClient(mockConfig) as any;
  c.client = { request: vi.fn().mockResolvedValue({ status: 'not_found' }) };
  await expect(
    c.resolveOnlineLecture({ courseUrl: 'https://sdo.tusur.ru/course/view.php?id=22413' }),
  ).resolves.toEqual({ status: 'not_found' });
  expect(c.client.request).toHaveBeenCalledWith(
    { method: 'sdo/resolveOnlineLecture' },
    { courseUrl: 'https://sdo.tusur.ru/course/view.php?id=22413' },
  );
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npx vitest run tests/core/mcp-client.test.ts`
Expected: FAIL — `resolveOnlineLecture` не является функцией.

- [ ] **Step 3: Реализовать метод в `src/core/mcp-client.ts`**

```ts
async resolveOnlineLecture(input: {
  courseUrl?: string;
  courseQuery?: string;
  lectureQuery?: string;
}): Promise<OnlineLectureResolution> {
  await this.ensureConnected();
  if (!this.client) throw new Error('MCP client not initialized');
  return (await this.client.request(
    { method: 'sdo/resolveOnlineLecture' },
    input as any,
  )) as OnlineLectureResolution;
}
```

Добавить `implements OnlineLectureResolver` к объявлению класса и импортировать типы из `./types.js`.

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/core/mcp-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/mcp-client.ts tests/core/mcp-client.test.ts
git commit -m "feat: add resolveOnlineLecture to SDO MCP client"
```

---

### Task 8: Слияние при обновлении и дедупликация

**Files:**
- Create: `src/timetable/import-merger.ts`
- Test: `tests/timetable/import-merger.test.ts`

**Interfaces:**
- Consumes: `Job`, `ImportedOccurrence`.
- Produces: `MergeSummary`, `mergeImportedJobs(existing, imported)`.

- [ ] **Step 1: Написать падающий тест `tests/timetable/import-merger.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { mergeImportedJobs } from '../../src/timetable/import-merger.js';
import type { Job } from '../../src/core/types.js';

const base = (over: Partial<Job>): Job => ({
  id: 'tt:fvs:574-1:22413',
  enabled: true,
  source: 'timetable',
  origin: { faculty: 'fvs', group: '574-1', discipline: 'РМП2', sdoCourseId: '22413' },
  schedule: { type: 'imported', timezone: 'Asia/Tomsk', occurrences: [] },
  target: { type: 'search', courseId: '22413', courseName: 'РМП2' },
  browser: { headless: false },
  ...over,
});

const occ = (date: string, over = {}) => ({ date, joinAt: '13:15', leaveAt: '14:50', ...over });

describe('mergeImportedJobs', () => {
  it('adds new dates and removes vanished untouched dates', () => {
    const existing = [base({ schedule: { type: 'imported', timezone: 'Asia/Tomsk', occurrences: [occ('2026-09-30')] } })];
    const imported = [base({ schedule: { type: 'imported', timezone: 'Asia/Tomsk', occurrences: [occ('2026-10-07')] } })];
    const { jobs, summary } = mergeImportedJobs(existing, imported);
    expect(jobs[0]!.schedule).toMatchObject({ occurrences: [occ('2026-10-07')] });
    expect(summary).toMatchObject({ added: 1, removed: 1 });
  });

  it('preserves edited occurrences and does not remove them', () => {
    const existing = [base({ schedule: { type: 'imported', timezone: 'Asia/Tomsk', occurrences: [occ('2026-09-30', { joinAt: '15:00', edited: true })] } })];
    const { jobs, summary } = mergeImportedJobs(existing, []);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.schedule).toMatchObject({ occurrences: [occ('2026-09-30', { joinAt: '15:00', edited: true })] });
    expect(summary.preservedEdits).toBe(1);
  });

  it('keeps suppressed occurrences suppressed after refresh', () => {
    const existing = [base({ schedule: { type: 'imported', timezone: 'Asia/Tomsk', occurrences: [occ('2026-10-07', { suppressed: true })] } })];
    const imported = [base({ schedule: { type: 'imported', timezone: 'Asia/Tomsk', occurrences: [occ('2026-10-07')] } })];
    const { jobs } = mergeImportedJobs(existing, imported);
    expect((jobs[0]!.schedule as any).occurrences[0].suppressed).toBe(true);
  });

  it('never modifies a manual job', () => {
    const manual: Job = { ...base({}), id: 'manual-1', source: 'manual', origin: undefined };
    const { jobs } = mergeImportedJobs([manual], []);
    expect(jobs).toEqual([manual]);
  });

  it('deletes a timetable job when its discipline disappears', () => {
    const existing = [base({})];
    const { jobs, summary } = mergeImportedJobs(existing, []);
    expect(jobs).toEqual([]);
    expect(summary.jobsDeleted).toBe(1);
  });

  it('suppresses an imported occurrence that duplicates a manual pair', () => {
    const manual: Job = {
      ...base({}),
      id: 'manual-rmp2',
      source: 'manual',
      origin: undefined,
      schedule: { type: 'once', date: '2026-09-30', joinAt: '13:15', leaveAt: '14:50', timezone: 'Asia/Tomsk' },
    };
    const imported = [base({ schedule: { type: 'imported', timezone: 'Asia/Tomsk', occurrences: [occ('2026-09-30')] } })];
    const { jobs } = mergeImportedJobs([manual], imported);
    const importedJob = jobs.find((j) => j.source === 'timetable')!;
    expect((importedJob.schedule as any).occurrences[0].suppressed).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npx vitest run tests/timetable/import-merger.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать `src/timetable/import-merger.ts`**

```ts
export interface MergeSummary {
  added: number;
  removed: number;
  preservedEdits: number;
  jobsCreated: number;
  jobsDeleted: number;
}
export function mergeImportedJobs(
  existing: Job[],
  imported: Job[],
): { jobs: Job[]; summary: MergeSummary };
```

Правила:
- Ручные задания (`source !== 'timetable'`) копируются без изменений.
- Авто-задание без соответствующего `imported` по `id`: если есть хоть одно `edited`/`suppressed` вхождение — оставить как есть, иначе не включать (jobsDeleted++).
- Для совпадающего `id`: слить `occurrences` по `date`:
  - если у существующего вхождения `edited` — берём существующее (preservedEdits++);
  - иначе если `suppressed` — берём `imported`-вхождение с `suppressed: true`;
  - иначе берём `imported`;
  - существующие вхождения с `edited` на датах вне `imported` — сохранить.
  - `added` считаем как даты `imported`, которых не было в существующих; `removed` — существующие не-`edited`/не-`suppressed` даты, которых нет в `imported`.
- Дедупликация: перед слиянием собрать из ручных заданий ключи `${date}|${joinAt}|${discipline}` (discipline из `origin` либо `target.courseName`), и если импортируемое вхождение совпадает — пометить его `suppressed: true`.

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/timetable/import-merger.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/timetable/import-merger.ts tests/timetable/import-merger.test.ts
git commit -m "feat: merge imported schedules preserving manual edits"
```

---

### Task 9: CLI-команда `import` и `listAll`/`delete` в репозитории

**Files:**
- Modify: `src/core/types.ts` (`JobRepository`)
- Modify: `src/persistence/job-repository.ts`
- Modify: `src/cli/commands.ts`
- Test: `tests/cli/import-command.test.ts`
- Test: `tests/persistence/job-repository.test.ts`

**Interfaces:**
- Consumes: `TimetableClient`, `groupOnlineDisciplines`, `buildImportedJobs`, `mergeImportedJobs`, `OnlineLectureResolver`, `HttpFetcher`.
- Produces: `JobRepository.listAll?()`, `JobRepository.delete?()`, CLI `import --db <path> [--auth-state <path>] [--faculty] [--group]`; `CliDependencies` для инъекции в тестах.

- [ ] **Step 1: Дописать падающие тесты репозитория в `tests/persistence/job-repository.test.ts`**

```ts
it('lists all jobs and deletes by id', async () => {
  const store = new SqliteStore(dbPath);
  await store.open();
  const repo = new SqliteJobRepository(store);
  await repo.save(enabled);
  expect((await repo.listAll()).map((j) => j.id)).toContain(enabled.id);
  await repo.delete(enabled.id);
  expect(await repo.getById(enabled.id)).toBeUndefined();
  store.close();
});
```

- [ ] **Step 2: Запустить тест репозитория и убедиться, что он падает**

Run: `npx vitest run tests/persistence/job-repository.test.ts`
Expected: FAIL — `listAll` не является функцией.

- [ ] **Step 3: Добавить `listAll?`/`delete?` в `src/core/types.ts` и реализовать в `SqliteJobRepository`**

В `JobRepository`:

```ts
  listAll?(): Promise<Job[]>;
  delete?(id: string): Promise<void>;
```

В `SqliteJobRepository`: `listAll()` — `SELECT payload FROM jobs ORDER BY id`; `delete(id)` — `DELETE FROM jobs WHERE id = ?`; оба с `await this.store.createBackup()` как в `save`.

- [ ] **Step 4: Написать падающий тест CLI `tests/cli/import-command.test.ts`**

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { executeCli } from '../../src/cli/commands.js';
import { SqliteStore } from '../../src/persistence/sqlite-store.js';
import { SqliteJobRepository } from '../../src/persistence/job-repository.js';

const home = '<a href="/faculties/fvs/groups/574-1">Мое расписание</a>';
const week = '<table><tbody><tr><td>ср, 30 сент.</td><td><span>13:15</span><span>14:50</span><div class="training training_type_lecture"><span class="discipline" data-lesson-id="1">РВП</span><span class="kind">Лекция</span><span class="note">реализуется в ЭИОС</span></div></td></tr></tbody></table>';

describe('cli import', () => {
  it('imports online lectures into the database', async () => {
    const db = join(mkdtempSync(join(tmpdir(), 'ol-')), 'lectures.db');
    const routes: Record<string, string> = {
      '/': home,
      '/faculties/fvs/groups/574-1': '<a href="?week_id=839"></a>',
      '/ocenka/api/v1/lessons/1/course_links': '[{"url":"https://sdo.tusur.ru/auth/edu?id=22414","anchor":"a","group":"574-1"}]',
      '/faculties/fvs/groups/574-1?week_id=839': week,
    };
    const result = await executeCli(['import', '--db', db], {
      createFetcher: async () => ({
        get: async (url) => {
          const u = new URL(url);
          return routes[u.pathname + u.search] ?? routes[u.pathname] ?? '';
        },
      }),
      createResolver: async () => ({
        resolveOnlineLecture: async () => ({
          status: 'resolved',
          course: { id: '22414', name: 'РВП' },
          module: { id: 'm', name: 'Онлайн-лекция', courseUrl: 'https://sdo.tusur.ru/course/view.php?id=22414', activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=1', type: 'lecture' },
        }),
      }),
    });
    expect(result.exitCode).toBe(0);
    const store = new SqliteStore(db);
    await store.open();
    const jobs = await new SqliteJobRepository(store).listAll();
    expect(jobs.map((j) => j.id)).toEqual(['tt:fvs:574-1:22414']);
    store.close();
  });

  it('leaves the database unchanged when fetching fails', async () => {
    const db = join(mkdtempSync(join(tmpdir(), 'ol-')), 'lectures.db');
    const store = new SqliteStore(db);
    await store.open();
    await new SqliteJobRepository(store).save({
      id: 'manual-1',
      enabled: true,
      source: 'manual',
      schedule: { type: 'once', date: '2026-09-30', joinAt: '13:15', leaveAt: '14:50', timezone: 'Asia/Tomsk' },
      target: { type: 'search', courseId: 'x' },
      browser: { headless: false },
    });
    store.close();

    const result = await executeCli(['import', '--db', db], {
      createFetcher: async () => ({ get: async () => { throw new Error('network down'); } }),
      createResolver: async () => ({ resolveOnlineLecture: async () => ({ status: 'not_found' }) }),
    });
    expect(result.exitCode).toBe(1);

    const reopened = new SqliteStore(db);
    await reopened.open();
    const jobs = await new SqliteJobRepository(reopened).listAll();
    expect(jobs.map((j) => j.id)).toEqual(['manual-1']);
    reopened.close();
  });
});
```

- [ ] **Step 5: Запустить тест CLI и убедиться, что он падает**

Run: `npx vitest run tests/cli/import-command.test.ts`
Expected: FAIL — `import` неизвестная команда.

- [ ] **Step 6: Реализовать команду `import` в `src/cli/commands.ts`**

Расширить сигнатуру: `export async function executeCli(argumentsList: string[], dependencies: CliDependencies = {})`, где

```ts
export interface CliDependencies {
  createFetcher?: (authStatePath?: string) => Promise<HttpFetcher>;
  createResolver?: () => Promise<OnlineLectureResolver>;
  now?: () => Date;
}
```

Ветка `import`:
1. `--db` обязателен, иначе exitCode 1.
2. `fetcher = await (dependencies.createFetcher ?? defaultFetcher)(authStatePath)`.
3. `client = new TimetableClient({ fetcher })`.
4. `{ faculty, group } = options.faculty && options.group ? {...} : await client.discoverGroup()`.
5. `lessons = await client.fetchOnlineLessons(faculty, group)`; если пусто — output `No online lessons found\n`, exitCode 0.
6. `{ disciplines, unresolved } = await groupOnlineDisciplines(lessons, (id) => client.fetchCourseLinks(id))`.
7. `resolver = await (dependencies.createResolver ?? defaultResolver)()`.
8. `built = await buildImportedJobs({ faculty, group, disciplines, resolver })`.
9. `existing = await jobRepo.listAll!()`.
10. `{ jobs, summary } = mergeImportedJobs(existing, built.jobs)`.
11. Сохранить: для удалённых авто-заданий вызвать `jobRepo.delete!`; для остальных `jobRepo.save`.
12. Вывести сводку `added/removed/jobsCreated/jobsDeleted` в stdout, exitCode 0.

Сохранять БД **только после** успешной сборки и слияния: при ошибке сети или парсинга вернуть exitCode 1 и не менять базу.

`defaultFetcher` пока бросает `new Error('Authenticated fetcher is not configured')` (реальный адаптер — Task 10); `defaultResolver` использует `SdoMcpClient` с `loadMcpConfig()`.

- [ ] **Step 7: Запустить тесты CLI и репозитория**

Run: `npx vitest run tests/cli/import-command.test.ts tests/persistence/job-repository.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/core/types.ts src/persistence/job-repository.ts src/cli/commands.ts tests/cli/import-command.test.ts tests/persistence/job-repository.test.ts
git commit -m "feat: add cli import command applying timetable merge"
```

---

### Task 10: Playwright-адаптер авторизованной выборки

**Files:**
- Create: `src/timetable/playwright-fetcher.ts`
- Test: `tests/timetable/playwright-fetcher.test.ts`

**Interfaces:**
- Consumes: `HttpFetcher`, `playwright`.
- Produces: `createPlaywrightFetcher({ authStatePath, baseUrl? })` -> `Promise<HttpFetcher & { close(): Promise<void> }>`.

- [ ] **Step 1: Написать падающий тест `tests/timetable/playwright-fetcher.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createPlaywrightFetcher } from '../../src/timetable/playwright-fetcher.js';

describe('createPlaywrightFetcher', () => {
  it('rejects when the auth state file does not exist', async () => {
    await expect(
      createPlaywrightFetcher({ authStatePath: '/nonexistent/state.json' }),
    ).rejects.toThrow(/auth state/i);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npx vitest run tests/timetable/playwright-fetcher.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать `src/timetable/playwright-fetcher.ts`**

Проверить существование `authStatePath` через `access`; иначе бросить `new Error('Auth state file not found: <path>')`. Создать `chromium.launch()` и `context = browser.newContext({ storageState: authStatePath })`. `get(url)` — новая страница, `page.goto(url, { waitUntil: 'domcontentloaded' })`, вернуть `page.content()`, закрыть страницу. `close()` — закрыть context и browser. Абсолютные адреса строить от `baseUrl` (по умолчанию `https://timetable.tusur.ru`).

- [ ] **Step 4: Запустить автотест**

Run: `npx vitest run tests/timetable/playwright-fetcher.test.ts`
Expected: PASS (проверяется только валидация пути).

- [ ] **Step 5: Ручная проверка на реальном auth state (опционально, вне CI)**

Создать storage state скриптом входа (в будущем — Electron onboarding), запустить:
`npm run cli -- import --db /tmp/ol.db --auth-state /tmp/tusur-state.json`
Expected: в БД появляются задания `tt:fvs:574-1:*` только для РМП2/РВП.

- [ ] **Step 6: Commit**

```bash
git add src/timetable/playwright-fetcher.ts tests/timetable/playwright-fetcher.test.ts
git commit -m "feat: add authenticated playwright timetable fetcher"
```

---

### Task 11: OpenSpec change и правки SPEC.md

**Files:**
- Create: `openspec/changes/timetable-auto-import/proposal.md`
- Create: `openspec/changes/timetable-auto-import/design.md`
- Create: `openspec/changes/timetable-auto-import/tasks.md`
- Create: `openspec/changes/timetable-auto-import/specs/timetable-import/spec.md`
- Create: `openspec/changes/timetable-auto-import/specs/onboarding/spec.md`
- Create: `openspec/changes/timetable-auto-import/specs/schedule-model/spec.md`
- Modify: `SPEC.md`
- Modify: `.planning/ROADMAP.md`

**Interfaces:**
- Consumes: согласованный дизайн `docs/superpowers/specs/2026-10-02-timetable-auto-import-design.md`.
- Produces: OpenSpec change и обновлённый SPEC.

- [ ] **Step 1: Создать OpenSpec change по образцу `openspec/changes/build-core-cli/`**

`proposal.md` — зачем автоимпорт; `design.md` — ссылка на дизайн-док; `tasks.md` — чеклист задач 1–10; спеки — требования к импорту, onboarding и модели расписания.

- [ ] **Step 2: Внести правки в `SPEC.md`**

- §1 — добавить автоимпорт расписания из timetable ТУСУР.
- §2 — снять запрет на импорт расписания вуза.
- §3 — добавить источник `timetable.tusur.ru`.
- §7.1 — форма логин/пароль + SSO, локальное хранение пароля.
- §7.3 — «разово / каждую неделю» и «Перенести».
- §8 — `imported`, `suppressed`, `edited`.
- §9 — локальное зашифрованное хранение пароля.
- §11 — критерии приёмки по импорту, слиянию, онлайн-детекту.

- [ ] **Step 3: Добавить фазу «Автоимпорт расписания ТУСУР» в `.planning/ROADMAP.md`**

- [ ] **Step 4: Commit**

```bash
git add openspec/changes/timetable-auto-import SPEC.md .planning/ROADMAP.md
git commit -m "docs: add timetable-auto-import openspec change and update SPEC"
```

---

## Финальная проверка

- [ ] `npm run build` — без ошибок типов.
- [ ] `npm test` — все тесты зелёные.
- [ ] `npm run lint` — без ошибок.
- [ ] `npm run format:check` — форматирование соблюдено.
- [ ] В `git status` нет сессий, SQLite, фикстур с персональными данными.
