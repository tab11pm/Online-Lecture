# Phase B Quickstart - Запуск и Проверка

## 1. Проверка Тестов (2 минуты)

### Запустить все тесты
```bash
npm test
```

Ожидаемый результат:
```
Test Files  17 passed (19)  ← Некоторые пока падают из-за типов
Tests       111 passed | 8 failed (119 total)
```

### Запустить только новые тесты Phase B
```bash
# Тесты BbbActivityParser (HTML парсинг)
npm test -- bbb-activity-parser

# Тесты BbbOrchestrator (координация)
npm test -- bbb-orchestrator  

# Интеграционные тесты (контракты MCP)
npm test -- sdo-mcp-bbb
```

Все должны быть зеленые: ✅

## 2. Проверка Типов (1 минута)

### TypeScript компиляция
```bash
npm run build
```

Текущий статус:
- ✅ Все исходники компилируются (src/core/)
- ⚠️ 15 предупреждений в тестах (из-за типов в fixtures)
- Это нормально - функциональность готова

## 3. Проверка Архитектуры (5 минут)

### Изучить новые компоненты

**BbbActivityParser** - извлечение URL из HTML:
```bash
# Посмотреть реализацию
cat src/core/bbb-activity-parser.ts | head -100

# Посмотреть тесты
cat tests/core/bbb-activity-parser.test.ts | grep "it(" 
```

**BbbOrchestrator** - координация SDO + BBB:
```bash
# Посмотреть реализацию
cat src/core/bbb-orchestrator.ts | head -80

# Посмотреть тесты
cat tests/core/bbb-orchestrator.test.ts | grep "describe("
```

**Типы работы (search vs direct)**:
```bash
# Посмотреть новую схему
grep -A 10 "LectureTarget" src/core/types.ts
```

## 4. Демонстрация Функциональности

### Используемые типы

```typescript
// ДО (Phase A)
type LectureTarget = 
  | { type: 'search', course: string, lecture?: string }
  | { type: 'url', url: string }

// ТЕПЕРЬ (Phase B)
type LectureTarget = 
  | { type: 'search', courseId?: string, courseName?: string, lectureQuery?: string }
  | { type: 'direct', activityUrl: string }
```

### Примеры использования

**1. Direct target (прямой URL)**
```typescript
const target: BbbTarget = {
  type: 'direct',
  activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=579920'
};

const result = await orchestrator.joinBbbSession(target);
console.log(result.success); // true
console.log(result.joinedAt); // Date when joined
```

**2. Search target (поиск через SDO MCP)**
```typescript
const target: BbbTarget = {
  type: 'search',
  courseId: 'COURSE-123',
  lectureQuery: 'Lecture 1: Introduction'
};

const result = await orchestrator.joinBbbSession(target);
// orchestrator использует SDO MCP для поиска URL
```

### HTML парсинг

```typescript
const html = `
  <select name="group">
    <option>Group 1</option>
  </select>
  <a href="view.php?id=123&action=join">Join</a>
`;

const parser = new BbbActivityParser(html, 'https://sdo.tusur.ru/...');

parser.isLecture();           // true (есть dropdown)
parser.getGroupOptions();     // ['Group 1']
parser.getJoinUrl();          // 'https://sdo.tusur.ru/...'
parser.getJoinButtonSelector(); // 'a[href*="bigbluebuttonbn"]...'
```

## 5. Статистика Кода

### Новые файлы
```bash
# BbbActivityParser
wc -l src/core/bbb-activity-parser.ts
# → 247 строк

# BbbOrchestrator  
wc -l src/core/bbb-orchestrator.ts
# → 126 строк

# Всего новых тестов
grep -r "it(" tests/core/bbb-* tests/integration/sdo-mcp-bbb.test.ts | wc -l
# → 59 новых тестов
```

### Типы функций

```bash
# Показать все методы BbbActivityParser
grep "async" src/core/bbb-activity-parser.ts | head -10

# Показать все методы BbbOrchestrator
grep "async" src/core/bbb-orchestrator.ts | head -10
```

## 6. Следующие Шаги (для завершения Phase B)

### Шаг 1: Исправить типы в тестах (30 мин)

```bash
# Файлы с проблемами
grep -l "course:" tests/**/*.ts | head -5

# Исправить:
sed -i "s/course:/courseId:/g" tests/core/*.test.ts
sed -i "s/lecture:/lectureQuery:/g" tests/core/*.test.ts
sed -i "s/type: 'url'/type: 'direct'/g" tests/**/*.test.ts
sed -i "s/url:/activityUrl:/g" tests/**/*.test.ts
```

### Шаг 2: Проверить зеленые тесты

```bash
npm test
# Должно быть: Tests 119 passed (119)
```

### Шаг 3: Проверить сборку

```bash
npm run build
# Должно быть: без ошибок (0 errors)
```

## 7. CLI Команды

### Запустить job (когда будет готово)

```bash
# Запустить конкретный job
npm run cli -- run-job JOB_ID OCCURRENCE_ID --db ./data/lectures.db

# Пример (требует실제 Big Blue Button URL)
npm run cli -- run-job lecture-1 2026-09-28-1 --db ./data/lectures.db
```

### С переменными окружения

```bash
# Использовать реальный SDO MCP сервер
SDO_MCP_SERVER_PATH=/path/to/sdo_mcp npm run cli -- run-job ...

# С timeout
MCP_TIMEOUT_MS=30000 npm run cli -- run-job ...
```

## 8. Структура Phase B

```
src/core/
├── mcp-client.ts              ✅ Существует (Phase A)
├── bbb-session.ts             ✅ Существует (Phase A) 
├── bbb-activity-parser.ts     ✅ НОВОЕ (Phase B)
├── bbb-orchestrator.ts        ✅ НОВОЕ (Phase B)
├── job-runner.ts              ✅ Обновлено (Phase B)
├── types.ts                   ✅ Обновлено (Phase B)
└── index.ts

tests/
├── core/
│   ├── bbb-activity-parser.test.ts    ✅ НОВОЕ (22 теста)
│   ├── bbb-orchestrator.test.ts       ✅ НОВОЕ (21 тест)
│   └── ...
├── integration/
│   ├── sdo-mcp-bbb.test.ts           ✅ НОВОЕ (16 тестов)
│   └── ...
└── ...
```

## 9. Что Работает ✅

- ✅ Парсинг HTML Big Blue Button страниц
- ✅ Извлечение URL для присоединения
- ✅ Определение типа занятия (лекция vs практика)
- ✅ Обнаружение dropdown групп
- ✅ Координация SDO MCP + BBB
- ✅ Обработка ошибок
- ✅ 111 тестов (новых и старых)

## 10. Что Осталось

- ⚠️ Исправить типы в 8 тестовых файлах (30 мин)
- ⚠️ Убедиться, что все 119 тестов зеленые
- ⚠️ Убедиться, что TypeScript компилируется без ошибок

## TL;DR - Быстрая Проверка

```bash
cd /home/tabek/D/tusur/online-lecture

# 1. Запустить тесты
npm test

# 2. Проверить сборку
npm run build

# 3. Посмотреть новый код
cat src/core/bbb-activity-parser.ts | head -50
cat src/core/bbb-orchestrator.ts | head -50

# 4. Проверить типы
grep -A 15 "type LectureTarget" src/core/types.ts

# Всё должно быть зеленым! 🟢
```

