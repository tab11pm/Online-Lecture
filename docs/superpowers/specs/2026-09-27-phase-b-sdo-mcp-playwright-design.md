# Phase B: SDO MCP + Playwright E2E Prototype Design

**Date**: 2026-09-27  
**Author**: Kiro  
**Status**: Approved for implementation  
**Project**: Online Lecture для SDO ТУСУР  
**Previous Phase**: Phase A - Core Scheduler & CLI

## 1. Objective

Implement an end-to-end prototype that demonstrates the core automation workflow:

1. **Obtain BBB URL** via SDO MCP integration
2. **Join BigBlueButton session** using Playwright
3. **Monitor and leave session** appropriately
4. **Provide CLI interface** for manual testing

Success criteria: A working CLI command that can connect to SDO, retrieve a lecture link, join the BBB session as a listener, and exit cleanly.

## 2. Context

The project currently has:
- ✅ Phase A completed: Core scheduler, SQLite persistence, YAML configuration, CLI commands
- ✅ Test infrastructure (Vitest) covering core, persistence, and config modules
- ✅ TypeScript project structure with clear separation of concerns

Missing components for Phase B:
- ❌ Integration with SDO MCP server
- ❌ Playwright automation for BBB sessions
- ❌ Coordinated job execution combining both systems

## 3. Architecture

### 3.1 Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Job Runner                           │
│  (coordinates MCP → BBB flow, handles errors and retries)   │
└───────────────────────────┬─────────────────────────────────┘
                            │
           ┌────────────────┴─────────────────┐
           │                                  │
   ┌───────▼──────┐                 ┌────────▼────────┐
   │  MCP Client  │                 │ BBB Session     │
   │  (std MCP)   │                 │ (Playwright)    │
   └───────┬──────┘                 └────────┬────────┘
           │                                  │
   ┌───────▼──────┐                 ┌────────▼────────┐
   │  SDO MCP     │                 │  bbb2.tusur.ru  │
   │  Server      │                 │  Web Interface  │
   └──────────────┘                 └─────────────────┘
```

### 3.2 Component Responsibilities

**MCP Client** (`src/core/mcp-client.ts`):
- Communicates with SDO MCP server via stdio protocol
- Methods: `authenticate`, `listCourses`, `findBbbActivity`, `getBbbUrl`
- Handles protocol errors, connection issues, and retries
- Returns validated BBB URLs with metadata

**BBB Session Manager** (`src/core/bbb-session.ts`):
- Manages Playwright browser lifecycle
- Methods: `startSession`, `joinAsListener`, `monitorSession`, `leaveSession`
- Ensures camera/microphone are disabled
- Monitors session state and handles disconnections
- Implements retry logic for technical issues

**Job Runner** (`src/core/job-runner.ts`):
- Orchestrates complete job execution flow
- Coordinates MCP client and BBB session
- Logs execution state to SQLite via existing repositories
- Implements deadline and retry policies from existing core modules

**MCP Configuration** (`src/config/mcp-config.ts`):
- Connection settings for SDO MCP server
- Authentication credentials (stored securely)
- Timeout and retry configuration

## 4. Detailed Design

### 4.1 MCP Client Implementation

```typescript
// Contract with SDO MCP server
interface SdoMcpClient {
  authenticate(credentials: Credentials): Promise<Session>;
  listCourses(session: Session): Promise<Course[]>;
  findBbbActivity(courseId: string, lectureName: string): Promise<BbbActivity>;
  getBbbUrl(activityId: string): Promise<BbbUrl>;
}

// Integration via @modelcontextprotocol/sdk
class StdMcpClient implements SdoMcpClient {
  private client: Client;
  
  constructor(config: McpConfig) {
    // Initialize stdio connection to SDO MCP server
  }
  
  async authenticate(credentials: Credentials): Promise<Session> {
    // Send auth request via MCP protocol
    // Return session token with expiration
  }
}
```

**Key considerations:**
- Use existing `@modelcontextprotocol/sdk` for protocol compliance
- Implement proper error handling for network issues
- Cache session tokens appropriately
- Validate responses against Zod schemas

### 4.2 BBB Session Manager Implementation

```typescript
interface BbbSessionManager {
  startSession(url: string, config: SessionConfig): Promise<BbbSession>;
  joinAsListener(session: BbbSession): Promise<void>;
  monitorSession(session: BbbSession): Promise<SessionState>;
  leaveSession(session: BbbSession): Promise<void>;
}

class PlaywrightBbbSessionManager implements BbbSessionManager {
  private browser: Browser;
  private page: Page;
  
  async startSession(url: string, config: SessionConfig): Promise<BbbSession> {
    // Launch Playwright with appropriate flags
    // Navigate to BBB URL
    // Return session handle
  }
  
  async joinAsListener(session: BbbSession): Promise<void> {
    // Click "Listen only" button
    // Ensure camera/microphone are disabled
    // Wait for connection to establish
  }
}
```

**Key considerations:**
- Use headful mode initially for debugging
- Implement "headless" mode as experimental feature
- Handle WebRTC audio connection issues
- Detect session end (moderator closes, timeout)
- Take screenshots for debugging when needed

### 4.3 Job Runner Implementation

```typescript
class JobRunner {
  constructor(
    private mcpClient: SdoMcpClient,
    private bbbManager: BbbSessionManager,
    private jobRepo: JobRepository,
    private runRepo: RunRepository
  ) {}
  
  async runJob(jobId: string): Promise<RunResult> {
    // 1. Load job from repository
    // 2. Authenticate with SDO via MCP
    // 3. Find BBB activity and get URL
    // 4. Start BBB session and join as listener
    // 5. Monitor until session ends or deadline
    // 6. Leave session and clean up
    // 7. Log result to run repository
  }
}
```

**Key considerations:**
- Use existing `deadline.ts` and `retry.ts` modules
- Implement state machine for job execution
- Handle partial failures (MCP works but BBB fails)
- Provide detailed logging for debugging

### 4.4 CLI Integration

```typescript
// Extend existing CLI commands
program
  .command('run-test')
  .description('Test MCP + BBB integration with a test lecture')
  .action(async () => {
    // Initialize components
    // Run test job
    // Report results
  });
```

## 5. File Structure

```
src/
├── core/
│   ├── mcp-client.ts          # SDO MCP client implementation
│   ├── bbb-session.ts         # BBB session management
│   ├── job-runner.ts          # Job orchestration
│   └── index.ts              # Export new modules
├── config/
│   └── mcp-config.ts          # MCP connection configuration
└── cli/
    └── commands.ts           # Updated with test command

tests/
├── core/
│   ├── mcp-client.test.ts    # Unit tests for MCP client
│   ├── bbb-session.test.ts   # Unit tests for BBB session
│   └── job-runner.test.ts    # Integration tests
├── fixtures/
│   ├── mcp-response.json     # Mock MCP responses
│   ├── bbb-test-config.yml   # Test BBB configuration
│   └── sdo-credentials.yml   # Test credentials (gitignored)
└── e2e/
    └── bbb-integration.test.ts # E2E test with fixtures
```

## 6. Dependencies

Add to `package.json`:

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0",
    "playwright": "^1.52.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.52.0",
    "@types/playwright": "^1.52.0"
  }
}
```

## 7. Testing Strategy

### 7.1 Unit Tests
- **MCP Client**: Mock stdio connection, test protocol handling
- **BBB Session**: Mock Playwright, test state transitions
- **Job Runner**: Test orchestration logic with mocked dependencies

### 7.2 Contract Tests
- **MCP Contract**: Verify protocol compliance against SDO MCP spec
- **BBB Contract**: Test against fixture BBB responses

### 7.3 Integration Tests
- **MCP + BBB**: Test complete flow with fixture data
- **Error Handling**: Test recovery from various failure modes

### 7.4 E2E Test
- **Complete Flow**: Run against test SDO account (when available)
- **Headful Mode**: Verify visual interaction works
- **Logging**: Ensure proper logging throughout

## 8. Implementation Phases

### Phase B.1: MCP Client Foundation (Week 1)
- Add dependencies and configure MCP client
- Implement protocol handling with error recovery
- Create contract tests with fixture data
- Add CLI command to test MCP connection

### Phase B.2: BBB Session Manager (Week 2)
- Install Playwright and configure browser
- Implement BBB session lifecycle
- Create test fixtures for BBB responses
- Add CLI command to test BBB joining

### Phase B.3: Job Runner Integration (Week 3)
- Combine MCP client and BBB session manager
- Implement job orchestration with existing core modules
- Add comprehensive logging to SQLite
- Create integration tests

### Phase B.4: E2E Validation (Week 4)
- Test complete flow with test SDO account
- Debug and fix integration issues
- Optimize performance and reliability
- Document usage and troubleshooting

## 9. Security Considerations

1. **Credentials Storage**: MCP credentials stored in user config directory, not in repo
2. **Session Isolation**: Each job runs in isolated browser context
3. **Data Redaction**: URLs and credentials redacted from logs (use existing `redaction.ts`)
4. **Cleanup**: Browser profiles and temporary files cleaned up after execution

## 10. Success Metrics

1. ✅ CLI command `run-test` successfully connects to SDO and joins BBB
2. ✅ Session joins as listener with camera/microphone disabled
3. ✅ Session exits cleanly when ended by moderator or timeout
4. ✅ All execution steps logged to SQLite with proper redaction
5. ✅ Unit and integration tests pass
6. ✅ E2E test runs successfully with test account

## 11. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| SDO MCP protocol changes | Use versioned protocol, implement compatibility layer |
| BBB UI changes | Regular monitoring, screenshot comparison tests |
| Playwright compatibility | Pin versions, test on Windows target environment |
| Network instability | Implement retries with exponential backoff |
| Authentication issues | Clear error messages, credential management UI |

---

**Approval**: This design has been reviewed and approved for implementation as Phase B of the Online Lecture project.