# Phase B Completion Plan: Real SDO MCP + BBB Integration

**Status**: Ready for inline execution  
**Date**: 2026-09-28  
**Executor**: inline (current session)  
**Base Spec**: `/home/tabek/D/tusur/online-lecture/docs/phase-b-sdo-mcp-design.md`

## Overview

Phase B implementation is 80% complete with working MCP client, BBB session manager, and job runner. The remaining work is:

1. Fix integration tests (currently timing out on real SDO MCP server connection)
2. Implement BBB activity parser (HTML extraction)
3. Finalize BbbOrchestrator coordination layer
4. Verify CLI integration works end-to-end
5. Document manual E2E testing procedure

## Current State Assessment

✅ **Complete**:
- SdoMcpClient (src/core/mcp-client.ts) - stdio MCP wrapper
- BbbSessionManager (src/core/bbb-session.ts) - Playwright automation
- JobRunner (src/core/job-runner.ts) - Orchestration skeleton
- MCP config (src/config/) - Environment-based configuration
- 61 unit tests passing

❌ **Incomplete**:
- Integration tests timeout (need to skip or fix real server connection)
- BbbActivityParser (HTML parsing) - not implemented
- BbbOrchestrator (coordination) - placeholder only
- CLI integration with real orchestrator - using JobRunner stub
- E2E testing documentation

## Tasks (7 total)

### Task 1: Fix Integration Tests (Skip Real Server, Use Mocks)
**Scope**: tests/integration/sdo-mcp-real.test.ts  
**Why**: Tests timeout trying to start real SDO MCP subprocess. Replace with mock-based integration tests that verify contract without real subprocess overhead.

**Completion Contract**:
- Integration tests pass without subprocess overhead
- Tests verify MCP protocol handling (mock transport)
- Tests verify BBB URL extraction
- Test file: tests/integration/sdo-mcp-bbb-real.test.ts (renamed/rewritten)
- Command: `npm test -- integration/sdo-mcp-bbb-real`

### Task 2: Implement BbbActivityParser
**Scope**: src/core/bbb-activity-parser.ts (NEW)  
**Purpose**: Parse BBB activity HTML, extract join button/link

**Methods**:
```typescript
class BbbActivityParser {
  constructor(html: string, activityUrl: string)
  isLecture(): boolean
  requiresGroupSelection(): boolean
  getJoinUrl(): string
  getJoinButtonSelector(): string
}
```

**Completion Contract**:
- Parser correctly identifies lecture vs practical
- Parser extracts join URLs from Moodle HTML
- Unit tests cover 5+ HTML samples
- Command: `npm test -- core/bbb-activity-parser`

### Task 3: Implement BbbOrchestrator
**Scope**: src/core/bbb-orchestrator.ts (NEW)  
**Purpose**: Coordinate SDO MCP lookup + BBB session joining

**Methods**:
```typescript
class BbbOrchestrator {
  constructor(sdoMcpClient: SdoMcpClient, bbbSessionManager: PlaywrightBbbSessionManager)
  async joinBbbSession(target: BbbTarget): Promise<BbbJoinResult>
}
```

**Completion Contract**:
- Orchestrator handles 'search' targets (SDO lookup)
- Orchestrator handles 'direct' targets (use URL)
- Proper error handling and logging
- Unit tests with mocked clients
- Command: `npm test -- core/bbb-orchestrator`

### Task 4: Verify Job Config Schema
**Scope**: src/core/types.ts  
**Purpose**: Ensure Job interface supports both search and direct targets

**Completion Contract**:
- Job interface has target: { type: 'search' | 'direct' }
- Target includes course/lecture (search) or activityUrl (direct)
- Types compile without errors
- Run: `npm run build`

### Task 5: CLI Integration
**Scope**: src/cli/commands.ts (UPDATE)  
**Purpose**: Use real BbbOrchestrator instead of stub JobRunner

**Completion Contract**:
- `run-job` command creates BbbOrchestrator
- SDO MCP client initialized from env/config
- Proper error handling and logging
- Job result stored in run state
- Tests pass: `npm test -- cli`

### Task 6: Unit Tests Complete
**Scope**: All new modules  
**Purpose**: Full coverage of new code

**Completion Contract**:
- All new modules have unit tests
- Mock-based (no real subprocess/browser)
- 80%+ line coverage on new code
- Command: `npm test`

### Task 7: Document Manual E2E Testing
**Scope**: docs/phase-b-e2e-testing.md (NEW)  
**Purpose**: Guide for manual testing with real SDO + BBB

**Completion Contract**:
- Step-by-step procedure documented
- Prerequisites listed
- Expected behavior described
- Troubleshooting section included
- File exists and is readable

## Shared Interfaces (Pre-flight Check)

| Task | Produces | Task | Consumes | Status |
|------|----------|------|----------|--------|
| 2 | BbbActivityParser class | 3 | Used by BbbOrchestrator | ✅ Clear interface |
| 1,3,6 | SdoMcpClient, PlaywrightBbbSessionManager | 3 | Injected into BbbOrchestrator | ✅ Already exist |
| 3 | BbbOrchestrator class | 5 | Used by CLI run-job | ✅ Clear interface |
| 4 | Job type with target field | 5 | Read by run-job command | ✅ Type-safe |

**Pre-flight Result**: No conflicts detected. All interfaces already exist or clearly specified.

## Execution Order

Tasks are **mostly independent** but have one dependency chain:
- Task 1 (fix tests) can run any time — enables faster feedback loop
- Task 2 (parser) → Task 3 (orchestrator) — parser consumed by orchestrator
- Tasks 4,5,6 can run once 2,3 are done
- Task 7 (docs) can run last

**Execution approach**: 
1. Start Task 1 (fix tests) → unblocks feedback
2. Tasks 2,3 in sequence (dependency)
3. Tasks 4,5,6 in parallel (independent)
4. Task 7 (docs) last

## Success Criteria

- [ ] npm test passes (all tests green, no timeouts)
- [ ] npm run build succeeds
- [ ] BbbActivityParser implemented with tests
- [ ] BbbOrchestrator implemented with tests
- [ ] CLI run-job uses real orchestrator
- [ ] E2E testing guide documented
- [ ] No TypeScript errors
- [ ] Job schema supports search and direct targets

## Known Constraints

- Do not modify Phase A code (scheduler, CLI infrastructure)
- Do not add new dependencies without approval
- Integration tests must not require real subprocess (too fragile)
- Unit tests must use mocks for Playwright (fast, deterministic)
- E2E tests remain manual-only (require real TUSUR credentials)

## Estimated Time

- Task 1: 15 mins (rewrite tests to use mocks)
- Task 2: 30 mins (parser + tests)
- Task 3: 40 mins (orchestrator + tests)
- Task 4: 10 mins (verify types)
- Task 5: 20 mins (CLI integration)
- Task 6: 20 mins (test completion)
- Task 7: 15 mins (documentation)
- **Total**: ~2.5 hours

---

**Plan Status**: Ready for inline execution  
**Next**: Create workspace, then execute Task 1
