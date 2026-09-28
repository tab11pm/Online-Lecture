# Phase B: SDO MCP + BBB Integration - Design Document

**Status**: Design Phase  
**Date**: 2026-09-28  
**Target**: Real SDO MCP server integration with BigBlueButton Playwright automation

## Overview

Phase B integrates the existing **SDO MCP server** (Playwright-based SDO TUSUR scraper) with **BigBlueButton automation** to create an end-to-end workflow for automatically joining lectures.

### Architecture

```
Online Lecture Scheduler
  │
  ├─→ Job Repository (SQLite)
  │    └─ Job config: course ID, activity ID, schedule
  │
  ├─→ SDO MCP Client
  │    └─ Playwright-based browser automation
  │       ├─ Auto-login via TUSUR profile
  │       ├─ List courses
  │       ├─ Find BigBlueButton activities
  │       └─ Get activity page HTML
  │
  └─→ BBB Session Manager
       └─ Playwright browser instance
          ├─ Open BBB activity page
          ├─ Parse "Join" button / meeting link
          ├─ Handle group selection (if needed for lectures)
          ├─ Click join and enter session
          └─ Monitor and gracefully exit
```

## Current State

### SDO MCP Server ✅ 
**Location**: `/home/tabek/D/tusur/sdo_mcp/`  
**Status**: Running, fully functional

**Available Tools**:
- `list_courses()` - Get all courses
- `list_course_modules(courseUrl)` - Get course materials/assignments
- `find_course_module(courseUrl, query)` - Search for specific module
- `get_assignment_details(assignmentUrl)` - Fetch page HTML
- `download_module_files(moduleUrl)` - Download resources

**Configuration** (`.env`):
```
SDO_URL=https://sdo.tusur.ru
TUSUR_PROFILE_LOGIN_URL=https://profile.tusur.ru/en/users/sign_in
SDO_USERNAME=tabrezshonizorov@gmail.com
SDO_PASSWORD=NPsLSpk4!y!g!Qn
HEADLESS=false
```

**How it works**:
1. Starts Playwright browser
2. Auto-logs in via TUSUR profile (OAuth redirect)
3. Navigates to SDO
4. Scrapes/parses page content
5. Returns data to MCP client via stdio protocol

### BigBlueButton in SDO ✅
**URL Pattern**: `https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=<ACTIVITY_ID>&group=<GROUP_ID>`

**Page Structure**:
- Activity page is a Moodle BigBlueButton module
- Contains a "подключится к сеансу" (Join session) button/link
- For lectures: requires selecting all groups before join button appears
- For practical classes: join button visible immediately

**Join Flow**:
1. Open activity URL in browser
2. Wait for page load
3. **If lecture**: Select all groups in dropdown → join button appears
4. **If practical**: Join button already visible
5. Click join button → redirects to BigBlueButton server
6. Enter meeting (video/audio setup might be needed)

---

## Phase B Implementation Tasks

### Task 1: Create Real SdoMcpClient
**File**: `src/core/sdo-mcp-client.ts`  
**Purpose**: Wrapper around actual SDO MCP server (stdio-based)

**Responsibilities**:
- Connect to SDO MCP server via stdio transport
- Call actual MCP tools (not fake API)
- Handle MCP protocol communication

**Key Methods**:
```typescript
class SdoMcpClient {
  constructor(sdoMcpServerPath: string)
  
  async listCourses(): Promise<Course[]>
  // Uses: list_courses() tool
  
  async findBbbActivity(courseUrl: string, lectureName: string): Promise<BbbActivity>
  // Uses: find_course_module(courseUrl, query) tool
  // Returns: { id, name, url, type: 'bbb' }
  
  async getBbbPage(activityUrl: string): Promise<string>
  // Uses: get_assignment_details(assignmentUrl) tool
  // Returns: HTML content of BBB activity page
  
  async close(): Promise<void>
  // Close MCP connection
}
```

**Interfaces**:
```typescript
interface Course {
  id: string
  name: string
  url: string
}

interface BbbActivity {
  id: string
  name: string
  courseUrl: string
  activityUrl: string  // The full BBB activity page URL
  type: 'lecture' | 'practical'  // Hint for group selection needed
}

interface McpConfig {
  serverPath: string  // Path to sdo_mcp server executable or 'npm run dev' wrapper
  timeout: number     // Connection timeout in ms
}
```

---

### Task 2: Create BBB Activity Parser
**File**: `src/core/bbb-activity-parser.ts`  
**Purpose**: Parse BBB activity page HTML and extract join URL/button

**Responsibilities**:
- Parse HTML returned by SDO MCP
- Detect if lecture (needs group selection) or practical
- Extract join button/link
- Handle group selection if needed

**Key Methods**:
```typescript
class BbbActivityParser {
  constructor(html: string, activityUrl: string)
  
  isLecture(): boolean
  // Check if page has group selection dropdown
  
  requiresGroupSelection(): boolean
  // More robust check for group requirements
  
  getGroupOptions(): string[]
  // Returns: ['Group 1', 'Group 2', etc.]
  
  getJoinUrl(): string
  // Extracts the actual BBB meeting URL from HTML
  // Patterns:
  // - Direct link: https://bbb*.tusur.ru/b/MEETING_ID
  // - Form action with hidden field
  // - JavaScript onclick that constructs URL
  
  getJoinButtonSelector(): string
  // CSS/XPath selector for join button for Playwright
}
```

---

### Task 3: Create BBB Session Manager (Real Implementation)
**File**: `src/core/bbb-session.ts` (REWRITE)  
**Purpose**: Playwright automation for actual BBB joining

**Responsibilities**:
- Open BBB activity page in Playwright
- Handle group selection if lecture
- Click join button
- Wait for BBB interface
- Optionally: skip video/audio setup
- Monitor session state
- Gracefully leave

**Key Methods**:
```typescript
class PlaywrightBbbSessionManager {
  constructor(options?: BrowserOptions)
  
  async startSession(activityUrl: string, options?: SessionOptions): Promise<BbbSession>
  // Open activity page
  // Wait for page load
  // Return session handle
  
  async selectAllGroups(session: BbbSession): Promise<void>
  // If page has group dropdown: select all groups
  // Wait for join button to appear
  
  async joinSession(session: BbbSession): Promise<void>
  // Click join button
  // Wait for BBB to load (can skip audio/video setup)
  
  async monitorSession(session: BbbSession, timeout?: number): Promise<void>
  // Watch page for disconnect signal
  // Throw error if session ends
  
  async leaveSession(session: BbbSession): Promise<void>
  // Click leave/exit button
  // Close page/context
  
  async closeAll(): Promise<void>
  // Cleanup all sessions
}

interface BbbSession {
  page: Page  // Playwright page instance
  context: BrowserContext  // Playwright context
  activityUrl: string
  meetingUrl?: string
  startedAt: Date
  status: 'initializing' | 'joining' | 'joined' | 'left' | 'error'
}

interface SessionOptions {
  headless?: boolean
  timeout?: number
  skipAudioSetup?: boolean
  skipVideoSetup?: boolean
}
```

---

### Task 4: Create Orchestration Service
**File**: `src/core/bbb-orchestrator.ts` (NEW)  
**Purpose**: Coordinate SDO MCP lookup + BBB joining

**Responsibilities**:
- Given job config: resolve target type
- For 'search' target: query SDO MCP for course/lecture
- For 'direct' target: use provided URL directly
- Coordinate with BBB session manager
- Error handling and recovery

**Key Methods**:
```typescript
class BbbOrchestrator {
  constructor(
    sdoMcpClient: SdoMcpClient,
    bbbSessionManager: PlaywrightBbbSessionManager
  )
  
  async joinBbbSession(target: BbbTarget, options?: JoinOptions): Promise<BbbJoinResult>
  // target type 'search': find course/lecture in SDO, get URL
  // target type 'direct': use provided URL
  // Open BBB activity page
  // Select groups if needed
  // Join session
  // Return result with join timestamp, session ID if available
}

interface BbbTarget {
  type: 'search' | 'direct'
  
  // If search:
  course?: string          // Course name or ID
  lecture?: string         // Lecture/activity name
  
  // If direct:
  activityUrl?: string     // Full BigBlueButton activity URL
}

interface BbbJoinResult {
  success: boolean
  activityUrl: string
  meetingUrl?: string
  joinedAt: Date
  sessionDurationSeconds?: number
  error?: string
}
```

---

### Task 5: Update CLI to use Real SDO MCP
**File**: `src/cli/commands.ts` (UPDATE)  
**Command**: `run-job <job-id> <occurrence-id> --db <sqlite>`

**Changes**:
- Replace fake `SdoMcpClient` with real implementation
- Initialize SDO MCP client with server path (from config/env)
- Use `BbbOrchestrator` instead of `JobRunner`
- Log actual join status to SQLite run repository

**Environment Variables**:
```bash
SDO_MCP_SERVER_PATH=/path/to/sdo_mcp  # or "npm run dev" in sdo_mcp dir
MCP_TIMEOUT_MS=30000                   # Connection timeout
BBB_SESSION_TIMEOUT_MS=14400000        # 4 hours max session
```

---

### Task 6: Integration Tests
**File**: `tests/integration/sdo-mcp-bbb-real.test.ts` (NEW)

**Test Scenarios**:

1. **SDO MCP Connection**
   - Connect to real SDO MCP server
   - List courses
   - Verify response structure

2. **BBB Activity Lookup**
   - Search for specific course in SDO
   - Find BBB activity by name
   - Extract activity URL

3. **BBB Page Parsing**
   - Fetch activity page via SDO MCP
   - Parse HTML for join button/link
   - Detect if lecture or practical

4. **Full Join Flow (Manual Only)**
   - This requires real SDO login + BBB server
   - Document as manual testing procedure
   - Cannot be automated in CI

---

### Task 7: E2E Testing Guide
**File**: `docs/phase-b-e2e-testing.md`

**Manual Testing Procedure**:
1. Ensure SDO MCP server can run: `cd ~/D/tusur/sdo_mcp && npm run dev`
2. Create test job in SQLite:
   ```typescript
   {
     id: 'test-bbb-join',
     enabled: true,
     target: {
       type: 'direct',
       activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=579920&group=0'
     }
   }
   ```
3. Run: `npm run cli -- run-job test-bbb-join occ-1 --db ./data/lectures.db`
4. Observe:
   - Playwright window opens
   - Page loads
   - Join button clicked
   - BBB session starts

---

## Job Configuration Schema

Jobs stored in SQLite should support:

```typescript
interface Job {
  id: string
  enabled: boolean
  
  schedule: {
    type: 'once' | 'recurring'
    date: string           // YYYY-MM-DD
    joinAt: string         // HH:MM (when to join)
    leaveAt: string        // HH:MM (when to leave)
    timezone: string       // IANA timezone
  }
  
  target: {
    type: 'search' | 'direct'
    
    // If search:
    course?: string
    lecture?: string
    
    // If direct:
    activityUrl?: string
  }
  
  browser?: {
    headless?: boolean
    skipAudioSetup?: boolean
  }
}

interface RunState {
  jobId: string
  occurrenceId: string
  status: 'scheduled' | 'joining' | 'joined' | 'left' | 'error'
  activityUrl?: string
  meetingUrl?: string
  joinedAt?: string      // ISO timestamp
  leftAt?: string        // ISO timestamp
  durationSeconds?: number
  error?: string
}
```

---

## Error Handling

**Common Scenarios**:

| Scenario | Handling |
|----------|----------|
| SDO login fails | Retry with exponential backoff, max 3 times |
| BBB activity not found | Log error, skip occurrence |
| Join button not appearing | Wait up to 5s, then fail |
| BBB server down | Graceful exit, mark as error |
| Session timeout | Normal exit after configured duration |
| Browser crash | Restart browser, retry once |

---

## Configuration Files

### `src/config/sdo-mcp-config.ts`
Load and validate SDO MCP server configuration:
- Server executable path
- Timeout values
- Optional: proxy settings

### Environment Variables
```bash
SDO_MCP_SERVER_PATH=npm run dev  # How to start SDO MCP server
MCP_TIMEOUT_MS=30000              # MCP connection timeout
BBB_SESSION_TIMEOUT_MS=14400000   # Max 4 hours
BBB_HEADLESS=false                # Show Playwright window
BBB_SKIP_AUDIO=true               # Skip audio setup
BBB_SKIP_VIDEO=true               # Skip video setup
```

---

## File Structure (Post-Implementation)

```
src/
├── core/
│   ├── sdo-mcp-client.ts          ← NEW: Real MCP wrapper
│   ├── bbb-activity-parser.ts     ← NEW: HTML parser
│   ├── bbb-session.ts             ← REWRITE: Real BBB automation
│   ├── bbb-orchestrator.ts        ← NEW: Coordination service
│   ├── job-runner.ts              ← UPDATE: Use orchestrator
│   ├── types.ts                   ← UPDATE: Add new interfaces
│   └── index.ts                   ← UPDATE: Export new modules
│
├── config/
│   ├── sdo-mcp-config.ts          ← NEW: Config loader
│   └── index.ts
│
├── cli/
│   └── commands.ts                ← UPDATE: Use real SDO MCP

tests/
├── core/
│   ├── sdo-mcp-client.test.ts     ← NEW: Unit tests
│   ├── bbb-activity-parser.test.ts← NEW: Unit tests
│   ├── bbb-orchestrator.test.ts   ← NEW: Unit tests
│   └── ...
├── integration/
│   ├── sdo-mcp-bbb-real.test.ts   ← NEW: Real server tests
│   └── ...
└── fixtures/
    ├── bbb-activity-page.html     ← Sample BBB page
    └── ...

docs/
├── phase-b-sdo-mcp.md             ← THIS DOC
├── phase-b-e2e-testing.md         ← Manual testing guide
└── phase-b-api-reference.md       ← Detailed API docs
```

---

## Testing Strategy

### Unit Tests (Automated)
- `SdoMcpClient`: Mock MCP protocol
- `BbbActivityParser`: Parse sample HTML
- `BbbSessionManager`: Mock Playwright page
- `BbbOrchestrator`: Mock both clients

### Integration Tests (Automated)
- Connect to real SDO MCP server
- Parse real BBB activity pages
- Verify HTML structure

### E2E Tests (Manual)
- Real SDO login
- Real BigBlueButton joining
- Session monitoring
- Proper exit/cleanup

---

## Success Criteria

- [x] Documentation complete
- [ ] `SdoMcpClient` implementation
- [ ] `BbbActivityParser` implementation
- [ ] `BbbSessionManager` rewrite
- [ ] `BbbOrchestrator` implementation
- [ ] CLI integration
- [ ] All unit tests passing
- [ ] Manual E2E test successful
- [ ] Job config supports both 'search' and 'direct' targets
- [ ] Proper error handling and logging

---

## Migration from Phase B (Mock) to Phase B (Real)

**Breaking Changes**:
- `SdoMcpClient` constructor now requires `McpConfig` instead of accepting fake credentials
- `JobRunner` → `BbbOrchestrator` (different interface)
- Job target structure changes (add type field)

**Migration Path**:
1. Keep `JobRunner` as wrapper around `Orchestrator` for backward compatibility
2. Update job schema incrementally
3. Deprecate old unit tests, replace with real integration tests

---

## Next Steps (Phase C)

1. Electron desktop application with React renderer
2. Tray integration and auto-start
3. Real user testing with TUSUR account
4. Production deployment and monitoring
5. Advanced error recovery and retry strategies

---

**Document Status**: Ready for implementation  
**Implementation Phase**: New chat session  
**Contact**: Ready for questions during implementation
