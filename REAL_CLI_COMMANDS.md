# 🚀 РЕАЛЬНЫЕ CLI команды которые РАБОТАЮТ

## ✅ Команды которые есть в коде

### 1. Список jobs
```bash
npm run cli -- jobs list --db ./data/lectures.db
```

**Вывод:**
```
job-id-1    enabled    once
job-id-2    enabled    recurring
```

### 2. Запустить job
```bash
npm run cli -- run-job JOB_ID OCCURRENCE_ID --db ./data/lectures.db
```

**Пример:**
```bash
npm run cli -- run-job job-1 2026-09-28-1 --db ./data/lectures.db
```

### 3. Валидировать конфиг файл
```bash
npm run cli -- config validate --config ./job-config.yaml
```

### 4. Запустить job один раз
```bash
npm run cli -- run-once JOB_ID --db ./data/lectures.db
```

### 5. Проверить auth
```bash
npm run cli -- auth check
```

---

## ❌ Команды которых НЕТ

- `jobs create` - НЕ РЕАЛИЗОВАНА
- `jobs update` - НЕ РЕАЛИЗОВАНА
- `jobs delete` - НЕ РЕАЛИЗОВАНА

---

## 🔧 Как создать job вручную?

### Способ 1: Через YAML конфиг файл

Создай файл `my-job.yaml`:
```yaml
id: my-job-1
name: Test Job
enabled: true
schedule:
  type: once
  date: '2026-09-28'
  joinAt: '14:00'
  leaveAt: '15:00'
  timezone: UTC
target:
  type: direct
  activityUrl: https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=579920
browser:
  headless: true
```

Потом запусти:
```bash
npm run cli -- run --config ./my-job.yaml --db ./data/lectures.db
```

### Способ 2: Создать напрямую в SQLite (если знаешь SQL)

```bash
sqlite3 ./data/lectures.db
INSERT INTO jobs (id, name, enabled, schedule_json, target_json, browser_json)
VALUES (
  'test-job',
  'My Test Job',
  1,
  '{"type":"once","date":"2026-09-28","joinAt":"14:00","leaveAt":"15:00","timezone":"UTC"}',
  '{"type":"direct","activityUrl":"https://sdo.tusur.ru/..."}',
  '{"headless":true}'
);
```

---

## 📋 Полный рабочий workflow

### Шаг 1: Создать конфиг YAML
```bash
cat > test-job.yaml << 'CONFIG'
id: test-job-1
name: Direct BigBlueButton Test
enabled: true
schedule:
  type: once
  date: '2026-09-28'
  joinAt: '14:00'
  leaveAt: '15:00'
  timezone: UTC
target:
  type: direct
  activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=579920'
browser:
  headless: true
CONFIG
```

### Шаг 2: Сохранить в БД через config validate + run
```bash
npm run cli -- config validate --config ./test-job.yaml
npm run cli -- run --config ./test-job.yaml --db ./data/lectures.db
```

### Шаг 3: Проверить job создан
```bash
npm run cli -- jobs list --db ./data/lectures.db
```

**Вывод должен показать твой job:**
```
test-job-1    enabled    once
```

### Шаг 4: Запустить job
```bash
npm run cli -- run-job test-job-1 2026-09-28-1 --db ./data/lectures.db
```

---

## ✅ Тестирование с SDO MCP

### Терминал 1: Запустить SDO MCP
```bash
cd ~/D/tusur/sdo_mcp && npm run dev
```

### Терминал 2: Запустить job с поиском через MCP

Создай конфиг с **search target**:
```bash
cat > search-job.yaml << 'CONFIG'
id: search-job-1
name: Search via SDO MCP
enabled: true
schedule:
  type: once
  date: '2026-09-28'
  joinAt: '14:00'
  leaveAt: '15:00'
  timezone: UTC
target:
  type: search
  courseId: COURSE-OS-101
  lectureQuery: Lecture 1
browser:
  headless: true
CONFIG
```

Сохрани в БД:
```bash
npm run cli -- run --config ./search-job.yaml --db ./data/lectures.db
npm run cli -- jobs list --db ./data/lectures.db
```

Запусти job:
```bash
export SDO_MCP_SERVER_PATH=~/D/tusur/sdo_mcp
npm run cli -- run-job search-job-1 2026-09-28-1 --db ./data/lectures.db
```

---

## 🎯 Quick Test Right Now

```bash
cd /home/tabek/D/tusur/online-lecture

# 1. Создать конфиг
cat > quick-test.yaml << 'YAML'
id: quick-test
name: Quick Test
enabled: true
schedule:
  type: once
  date: '2026-09-28'
  joinAt: '14:00'
  leaveAt: '15:00'
  timezone: UTC
target:
  type: direct
  activityUrl: 'https://example.com/bbb'
browser:
  headless: true
YAML

# 2. Сохранить в БД
npm run cli -- run --config ./quick-test.yaml --db ./data/lectures.db

# 3. Проверить
npm run cli -- jobs list --db ./data/lectures.db

# 4. Запустить
npm run cli -- run-job quick-test 2026-09-28-1 --db ./data/lectures.db
```

---

## 📝 Почему нет `jobs create`?

`jobs create` еще не реализована в CLI. Нужно либо:
1. Добавить команду в `src/cli/commands.ts`
2. Или использовать конфиг файлы через `run` команду

Это **Phase C работа** - сейчас Phase B только тестирует что **может** работать с существующими jobs.

