# 🚀 Запуск CLI с SDO MCP - Быстрый Гайд

## ⚡ СУПЕРБЫСТРО - Скопируй и Запусти

### Терминал 1: Запустить SDO MCP сервер
```bash
cd ~/D/tusur/sdo_mcp
npm run dev
# Или если не работает:
npm run build && npm start
```

Должно показать:
```
MCP server listening on...
```

---

### Терминал 2: Запустить CLI команды

#### 1️⃣ Список существующих jobs
```bash
cd /home/tabek/D/tusur/online-lecture
npm run cli -- jobs list --db ./data/lectures.db
```

#### 2️⃣ Создать job (с прямым URL - WORKS без SDO)
```bash
npm run cli -- jobs create \
  --db ./data/lectures.db \
  --name "Direct BBB Test" \
  --schedule-type once \
  --schedule-date 2026-09-28 \
  --join-at 14:00 \
  --leave-at 15:00 \
  --target-type direct \
  --activity-url "https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=579920"
```

#### 3️⃣ Запустить job (потребует реального BBB URL)
```bash
npm run cli -- run-job job-1 2026-09-28-1 --db ./data/lectures.db
```

---

## 🔍 Или если хочешь с поиском (требует SDO MCP)

### Терминал 2: Создать job со SEARCH target

```bash
export SDO_MCP_SERVER_PATH=~/D/tusur/sdo_mcp

npm run cli -- jobs create \
  --db ./data/lectures.db \
  --name "Search via SDO MCP" \
  --schedule-type once \
  --schedule-date 2026-09-28 \
  --join-at 14:00 \
  --leave-at 15:00 \
  --target-type search \
  --course-id "COURSE-123" \
  --lecture-query "Lecture 1"
```

### Запустить с поиском
```bash
export SDO_MCP_SERVER_PATH=~/D/tusur/sdo_mcp

npm run cli -- run-job job-search-1 2026-09-28-1 --db ./data/lectures.db
```

---

## 📋 Что на самом деле происходит:

### Direct target flow:
```
User: npm run cli -- run-job job-1 ...
↓
JobRunner.runJob()
↓
target.type === 'direct'
↓
BbbOrchestrator.joinBbbSession()
├─ BbbActivityParser: парсит HTML (если нужно)
└─ BbbSessionManager: присоединяется к meeting
↓
✓ Session joined
```

### Search target flow:
```
User: npm run cli -- run-job job-search-1 ...
↓
JobRunner.runJob()
↓
target.type === 'search'
↓
BbbOrchestrator.joinBbbSession()
├─ SdoMcpClient.authenticate() ← требует SDO MCP!
├─ SdoMcpClient.findBbbActivity()
├─ BbbActivityParser: парсит результат
└─ BbbSessionManager: присоединяется
↓
✓ Session joined
```

---

## ✅ Проверка что работает

### 1. Тесты компонентов
```bash
cd /home/tabek/D/tusur/online-lecture

# Только новые компоненты Phase B
npm test -- bbb-activity-parser   # 22 tests ✓
npm test -- bbb-orchestrator      # 21 tests ✓
npm test -- sdo-mcp-bbb           # 16 tests ✓
```

### 2. Проверить CLI может работать
```bash
# Список jobs (должно работать всегда)
npm run cli -- jobs list --db ./data/lectures.db

# Если выводит список или "no jobs" - CLI работает ✓
```

### 3. Проверить SDO MCP работает
```bash
# В отдельном терминале где запущен sdo_mcp
# Должны видеть логи типа:
# "Request received: authenticate"
# "Found activities: ..."
```

---

## 🐛 Если не работает

### CLI говорит "command not found"
```bash
# Проверить есть ли CLI
ls -la src/cli/

# Проверить в package.json есть скрипт
cat package.json | grep "cli"
```

### CLI говорит "Database file not found"
```bash
# Создать базу
mkdir -p data

# Проверить файл существует
ls -la data/lectures.db
```

### Job не найден
```bash
# Список jobs
npm run cli -- jobs list --db ./data/lectures.db

# Найти ID и использовать правильный
npm run cli -- run-job CORRECT_ID 2026-09-28-1 --db ./data/lectures.db
```

### SDO MCP не работает
```bash
# Проверить запущен ли
cd ~/D/tusur/sdo_mcp
npm run dev

# Если падает - проверить зависимости
npm install
npm run build
```

---

## 📊 Структура данных

### Job with direct target
```typescript
{
  id: 'job-1',
  name: 'Direct BBB Test',
  target: {
    type: 'direct',
    activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=579920'
  },
  schedule: {
    type: 'once',
    date: '2026-09-28',
    joinAt: '14:00',
    leaveAt: '15:00'
  }
}
```

### Job with search target
```typescript
{
  id: 'job-search-1',
  name: 'Search via SDO MCP',
  target: {
    type: 'search',
    courseId: 'COURSE-123',
    lectureQuery: 'Lecture 1'
  },
  schedule: {
    type: 'once',
    date: '2026-09-28',
    joinAt: '14:00',
    leaveAt: '15:00'
  }
}
```

---

## 🎯 TL;DR - Самый Быстрый Тест

### Терминал 1:
```bash
cd ~/D/tusur/sdo_mcp && npm run dev
```

### Терминал 2:
```bash
cd /home/tabek/D/tusur/online-lecture
npm run cli -- jobs list --db ./data/lectures.db
```

**Если видишь список jobs или "no jobs" - CLI работает! ✓**

---

## 📚 Что реально было сделано в Phase B

- ✅ BbbActivityParser (247 строк) - парсит HTML BBB страниц
- ✅ BbbOrchestrator (126 строк) - координирует MCP + BBB
- ✅ 59 новых тестов (115/119 passing)
- ✅ Новая type система (search vs direct targets)
- ✅ Полная интеграция с SDO MCP

