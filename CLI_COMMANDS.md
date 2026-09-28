# CLI Commands - Запуск и Проверка с SDO MCP

## 1. Проверить, что SDO MCP сервер работает

### Найти SDO MCP сервер
```bash
# Искать в HOME директории
find ~ -name "sdo*" -o -name "*mcp*" 2>/dev/null | grep -E "(bin|src)" | head -10

# Или если ты знаешь путь
ls -la ~/D/tusur/sdo_mcp/
```

### Запустить SDO MCP сервер в отдельном терминале
```bash
# Способ 1: Если это Node.js проект
cd ~/D/tusur/sdo_mcp
npm start

# Способ 2: Если это исполняемый файл
./sdo_mcp

# Способ 3: Если это Python
python sdo_mcp.py

# Способ 4: Если это Binary
./sdo_mcp --listen localhost:3000
```

### Проверить, что SDO MCP работает
```bash
# Проверить на порту
lsof -i :3000  # Если используется порт 3000
lsof -i :5000  # Если используется порт 5000

# Или с curl
curl http://localhost:3000/health
curl http://localhost:5000/health
```

## 2. Подготовить Database для CLI

### Создать базу данных с job
```bash
cd /home/tabek/D/tusur/online-lecture

# Уже есть database? Проверить
ls -la data/lectures.db

# Если нет, создадим потом через CLI
```

## 3. Запустить CLI для создания job

### Вариант A: Использовать SEARCH target (требует SDO MCP)

```bash
# Установить переменную окружения для SDO MCP
export SDO_MCP_SERVER_PATH=~/D/tusur/sdo_mcp

# Запустить CLI - создать job с поиском
npm run cli -- jobs create \
  --db ./data/lectures.db \
  --name "Лекция 1: Введение" \
  --schedule-type once \
  --schedule-date 2026-09-28 \
  --join-at 14:00 \
  --leave-at 15:00 \
  --timezone UTC \
  --target-type search \
  --course-id "COURSE-123" \
  --lecture-query "Lecture 1"
```

### Вариант B: Использовать DIRECT target (требует URL)

```bash
# Без SDO MCP - просто прямой URL
npm run cli -- jobs create \
  --db ./data/lectures.db \
  --name "BBB Direct Join" \
  --schedule-type once \
  --schedule-date 2026-09-28 \
  --join-at 14:00 \
  --leave-at 15:00 \
  --timezone UTC \
  --target-type direct \
  --activity-url "https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=579920"
```

## 4. Проверить созданные jobs

```bash
# Список всех jobs
npm run cli -- jobs list --db ./data/lectures.db

# Вывод должен быть похож на:
# ID: job-1
# Name: Лекция 1: Введение
# Target: search (courseId: COURSE-123)
# Schedule: once at 2026-09-28 14:00 UTC
```

## 5. Запустить конкретный job

### Способ 1: С SEARCH target (требует SDO MCP)

```bash
# Убедиться, что SDO MCP работает в другом терминале!
# Установить переменную окружения
export SDO_MCP_SERVER_PATH=~/D/tusur/sdo_mcp
export MCP_TIMEOUT_MS=30000

# Запустить job
npm run cli -- run-job JOB_ID OCCURRENCE_ID --db ./data/lectures.db

# Пример с реальными ID (после создания job выше)
npm run cli -- run-job job-1 2026-09-28-1 --db ./data/lectures.db
```

### Способ 2: С DIRECT target (без SDO MCP)

```bash
# Не требует SDO MCP
npm run cli -- run-job job-direct-1 2026-09-28-1 --db ./data/lectures.db
```

## 6. Полный workflow - от начала до конца

### Шаг 1: Запустить SDO MCP (терминал 1)
```bash
cd ~/D/tusur/sdo_mcp
npm start  # или ./sdo_mcp или python sdo_mcp.py

# Ждите: "Server listening on..."
```

### Шаг 2: Создать job (терминал 2)
```bash
cd /home/tabek/D/tusur/online-lecture

# Установить переменную
export SDO_MCP_SERVER_PATH=~/D/tusur/sdo_mcp

# Создать job с поиском
npm run cli -- jobs create \
  --db ./data/lectures.db \
  --name "Test Lecture" \
  --schedule-type once \
  --schedule-date 2026-09-28 \
  --join-at 14:00 \
  --leave-at 15:00 \
  --target-type search \
  --course-id "COURSE-123" \
  --lecture-query "Lecture 1"

# Запомнить JOB_ID из вывода
```

### Шаг 3: Запустить job (терминал 2)
```bash
# Получить ID job
npm run cli -- jobs list --db ./data/lectures.db

# Найти ID и occurrence ID, потом запустить
npm run cli -- run-job JOB_ID OCCURRENCE_ID \
  --db ./data/lectures.db

# Ожидаемый вывод:
# ✓ Connected to SDO MCP
# ✓ Found activity: ...
# ✓ Extracted join URL: ...
# ✓ Started BBB session
# ✓ Joined meeting
# ✓ Monitoring session...
# ✓ Session ended
```

## 7. Диагностика - если что-то не работает

### Проблема: "Cannot connect to SDO MCP"

```bash
# 1. Проверить, что SDO MCP запущен
lsof -i :3000

# 2. Проверить переменную окружения
echo $SDO_MCP_SERVER_PATH

# 3. Проверить путь к exe
ls -la ~/D/tusur/sdo_mcp/

# 4. Запустить вручную с debug
export DEBUG=*
npm run cli -- run-job JOB_ID OCCURRENCE_ID --db ./data/lectures.db
```

### Проблема: "Job not found"

```bash
# 1. Проверить, что job создан
npm run cli -- jobs list --db ./data/lectures.db

# 2. Проверить правильность ID
npm run cli -- jobs list --db ./data/lectures.db | grep "ID:"

# 3. Использовать правильный ID
npm run cli -- run-job CORRECT_ID OCCURRENCE_ID --db ./data/lectures.db
```

### Проблема: "Cannot join BigBlueButton"

```bash
# 1. Проверить URL валиден
npm run cli -- jobs list --db ./data/lectures.db

# 2. Проверить, что URL открывается в браузере
open "https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=579920"

# 3. Запустить с debug
npm test -- integration  # Чтобы увидеть что работает
```

## 8. Реальные примеры команд (скопируй-паста)

### Создать job с поиском
```bash
export SDO_MCP_SERVER_PATH=~/D/tusur/sdo_mcp && \
npm run cli -- jobs create \
  --db ./data/lectures.db \
  --name "Operating Systems Lecture 1" \
  --schedule-type once \
  --schedule-date 2026-09-28 \
  --join-at 14:00 \
  --leave-at 15:00 \
  --target-type search \
  --course-id "COURSE-OS-101" \
  --lecture-query "Lecture 1: Introduction"
```

### Список jobs
```bash
npm run cli -- jobs list --db ./data/lectures.db
```

### Запустить job (замени ID на реальный)
```bash
export SDO_MCP_SERVER_PATH=~/D/tusur/sdo_mcp && \
npm run cli -- run-job job-1 2026-09-28-1 --db ./data/lectures.db
```

### С timeout и debug
```bash
export SDO_MCP_SERVER_PATH=~/D/tusur/sdo_mcp && \
export MCP_TIMEOUT_MS=30000 && \
npm run cli -- run-job job-1 2026-09-28-1 --db ./data/lectures.db
```

## 9. Структура CLI команд

```
npm run cli -- [command] [args]

Команды:
  jobs list                 # Список всех jobs
  jobs create              # Создать новый job
  jobs update <id>         # Обновить job
  run-job <id> <occ-id>   # Запустить job
  
Глобальные args:
  --db <path>              # Path to SQLite database (обязательно!)
```

## 10. Полный end-to-end test

```bash
#!/bin/bash
set -e

cd /home/tabek/D/tusur/online-lecture

echo "1. Экспортировать переменные..."
export SDO_MCP_SERVER_PATH=~/D/tusur/sdo_mcp
export MCP_TIMEOUT_MS=30000

echo "2. Проверить database..."
ls -la data/lectures.db

echo "3. Список jobs..."
npm run cli -- jobs list --db ./data/lectures.db

echo "4. Создать job..."
JOB_OUTPUT=$(npm run cli -- jobs create \
  --db ./data/lectures.db \
  --name "E2E Test" \
  --schedule-type once \
  --schedule-date 2026-09-28 \
  --join-at 14:00 \
  --leave-at 15:00 \
  --target-type direct \
  --activity-url "https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=579920" 2>&1)

echo "Job output: $JOB_OUTPUT"

echo "5. Запустить job..."
npm run cli -- run-job job-1 2026-09-28-1 --db ./data/lectures.db || true

echo "Done!"
```

