# Phase B: SDO MCP + Playwright E2E Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement E2E prototype that connects to SDO MCP, retrieves BBB lecture URL, joins session as listener, monitors and exits cleanly.

**Architecture:** Sequential integration: CLI → MCP Client → SDO MCP → BBB URL → BBB Session Manager → Playwright Browser. Clear separation of concerns following existing project structure.

**Tech Stack:** TypeScript, @modelcontextprotocol/sdk (MCP), Playwright, SQLite (existing), existing core modules.

**Spec:** docs/superpowers/specs/2026-09-27-phase-b-sdo-mcp-playwright-design.md

---

## Global Constraints

- TypeScript with 2-space indentation (from AGENTS.md)
- camelCase for values/functions, PascalCase for React components/classes
- Tests alongside source or in parallel `tests/` tree
- Fixtures under `tests/fixtures/`, never real session data
- Use existing Zod schemas for validation
- Follow existing code patterns in `src/core/`, `src/config/`, `src/persistence/`

## Review Focus

- MCP protocol error handling and retry logic
- Playwright browser lifecycle management and cleanup
- Session token caching and expiration handling
- BBB UI changes detection and adaptation
- Proper redaction of credentials in logs

---

### Task 1: Install Playwright and MCP dependencies

**Files:**
- Modify: `package.json` — add @modelcontextprotocol/sdk, playwright
- Modify: `package.json` — add @playwright/test to devDependencies

**Verification:**
- Run: `npx playwright --version && npm list @modelcontextprotocol/sdk playwright`
- Expected: Version output shows Playwright 1.52+ and MCP SDK installed

- [ ] **Step 1: Add dependencies to package.json**
- [ ] **Step 2: Run npm install**
- [ ] **Step 3: Verify installation**

---

### Task 2: Create MCP client module

**Files:**
- Create: `src/core/mcp-client.ts` — SDO MCP client implementation
- Create: `tests/core/mcp-client.test.ts` — unit tests
- Create: `tests/fixtures/mcp-response.json` — mock responses

**Interfaces:**
- Consumes: McpConfig from src/config/mcp-config.ts (Task 5)
- Produces: `class SdoMcpClient` with methods:
  - `authenticate(credentials: Credentials): Promise<Session>`
  - `listCourses(session: Session): Promise<Course[]>`
  - `findBbbActivity(courseId: string, lectureName: string): Promise<BbbActivity>`
  - `getBbbUrl(activityId: string): Promise<BbbUrl>`

- [ ] **Step 1: Write failing test in tests/core/mcp-client.test.ts**
- [ ] **Step 2: Run test to verify it fails (class not defined)**
- [ ] **Step 3: Implement SdoMcpClient in src/core/mcp-client.ts**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Add mock fixtures in tests/fixtures/mcp-response.json**
- [ ] **Step 6: Commit**

---

### Task 3: Create BBB session manager

**Files:**
- Create: `src/core/bbb-session.ts` — BBB session management
- Create: `tests/core/bbb-session.test.ts` — unit tests
- Create: `tests/fixtures/bbb-test-config.yml` — test configuration

**Interfaces:**
- Consumes: SessionConfig (URL, timeout settings)
- Produces: `class PlaywrightBbbSessionManager` with methods:
  - `startSession(url: string, config: SessionConfig): Promise<BbbSession>`
  - `joinAsListener(session: BbbSession): Promise<void>`
  - `monitorSession(session: BbbSession): Promise<SessionState>`
  - `leaveSession(session: BbbSession): Promise<void>`

- [ ] **Step 1: Write failing test in tests/core/bbb-session.test.ts**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement PlaywrightBbbSessionManager in src/core/bbb-session.ts**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Add test fixtures in tests/fixtures/bbb-test-config.yml**
- [ ] **Step 6: Commit**

---

### Task 4: Create job runner module

**Files:**
- Create: `src/core/job-runner.ts` — job orchestration
- Create: `tests/core/job-runner.test.ts` — integration tests

**Interfaces:**
- Consumes: SdoMcpClient (Task 2), BbbSessionManager (Task 3), JobRepository, RunRepository
- Produces: `class JobRunner` with method:
  - `runJob(jobId: string): Promise<RunResult>`
- Uses existing: deadline.ts, retry.ts, lifecycle.ts, redaction.ts

- [ ] **Step 1: Write failing test in tests/core/job-runner.test.ts**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement JobRunner in src/core/job-runner.ts**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 5: Add MCP configuration

**Files:**
- Create: `src/config/mcp-config.ts` — MCP connection configuration
- Modify: `src/core/index.ts` — export new modules

**Interfaces:**
- Produces: `interface McpConfig` with connection settings, credentials path, timeouts

- [ ] **Step 1: Write failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement mcp-config.ts**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Update src/core/index.ts exports**
- [ ] **Step 6: Commit**

---

### Task 6: Update CLI commands

**Files:**
- Modify: `src/cli/commands.ts` — add test-run command
- Modify: `src/cli/index.ts` — register new commands

**Interfaces:**
- Consumes: JobRunner (Task 4), McpConfig (Task 5)

- [ ] **Step 1: Add run-test command to commands.ts**
- [ ] **Step 2: Register command in index.ts**
- [ ] **Step 3: Run CLI help to verify command appears**
- [ ] **Step 4: Commit**

---

### Task 7: Integration tests and verification

**Files:**
- Create: `tests/e2e/bbb-integration.test.ts` — E2E test

**Verification:**
- Run: `npm test`
- Expected: All tests pass including new ones

- [ ] **Step 1: Create E2E test with fixtures**
- [ ] **Step 2: Run full test suite**
- [ ] **Step 3: Verify all tests pass**
- [ ] **Step 4: Final commit**