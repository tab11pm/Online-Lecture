# Tasks

## Phase 1: Types and Configuration

- [ ] **T1.1:** Add BBB monitor types to types.ts
  - Add `BbbMonitorConfig` interface
  - Add `BbbSessionEvent` union type
  - Add `BbbMonitorResult` interface
  - Verification: `npm run build`

## Phase 2: BbbMonitor Module

- [ ] **T2.1:** Create bbb-monitor.ts with cancellable loop
  - Export `startMonitoring(session, occurrence, abortSignal)` function
  - Loop with configurable `checkIntervalMs`
  - Deadline check using `leaveIfDeadlineReached()`
  - Collect events: `waiting_room`, `connected`, `deadline_reached`, `manual_stop`
  - Return `BbbMonitorResult`
  - Verification: `npm run test -- --run tests/core/bbb-monitor.test.ts`

- [ ] **T2.2:** Integrate retry logic in BbbMonitor
  - On `network_error` event, call `nextRetryDelay(attempt)`
  - Maximum 3 retry attempts (5, 15, 30 seconds)
  - Return `failed` status if all retries exhausted
  - Verification: `npm run test -- --run tests/core/bbb-monitor.test.ts --retry`

## Phase 3: BBB Session Manager Extensions

- [ ] **T3.1:** Add waitForModerator() to bbb-session.ts
  - Wait for `[data-testid="waiting-room"]` or equivalent selector
  - Transition to `waiting_room` state
  - Timeout after 15 minutes (SPEC requirement)
  - Verification: `npm run test -- --run tests/core/bbb-session.test.ts --waitForModerator`

- [ ] **T3.2:** Add detection methods to bbb-session.ts
  - `detectMeetingEnd(session)`: returns true if BBB shows meeting ended
  - `detectModeratorRemoval(session)`: returns true if BBB shows user removed
  - Use fixtures from `tests/fixtures/bbb-selectors.json`
  - Verification: `npm run test -- --run tests/core/bbb-session.test.ts --detectEvents`

## Phase 4: Graceful Shutdown

- [ ] **T4.1:** Create graceful-shutdown.ts
  - Export `createGracefulShutdown()` returning `{ abortController, install, uninstall }`
  - Install SIGINT and SIGTERM handlers
  - On signal: call `abortController.abort()` and log event
  - Verification: `npm run test -- --run tests/core/graceful-shutdown.test.ts`

- [ ] **T4.2:** Integrate graceful shutdown in JobRunner
  - Create `AbortController` before monitor loop
  - Pass signal to `BbbMonitor`
  - On abort: set `completionReason: 'manual'`
  - Verification: Manual SIGINT test

## Phase 5: JobRunner Integration

- [ ] **T5.1:** Pass Occurrence to BBB session
  - In `runJob()`: load `Occurrence` via `findActiveOccurrence(job, now)`
  - Pass `occurrence` to `bbbManager.startSession()` config
  - Verification: `npm run test -- --run tests/core/job-runner.test.ts`

- [ ] **T5.2:** Use BbbMonitor in runJob()
  - Replace direct `monitorSession()` call with `startMonitoring()`
  - Handle all event types and set appropriate `completionReason`
  - Handle abort from graceful shutdown
  - Verification: `npm run test -- --run tests/core/job-runner.test.ts`

## Phase 6: Testing

- [ ] **T6.1:** Create bbb-selectors.json fixture (BLOCKED by manual BBB inspection)
  - Document BBB UI selectors for:
    - Waiting room indicator
    - Meeting ended message
    - Moderator removed message
    - Listen Only button
    - Leave button
  - Output: `tests/fixtures/bbb-selectors.json`

- [ ] **T6.2:** Unit tests for BbbMonitor
  - Test deadline reached transition
  - Test retry delays (5/15/30)
  - Test abort signal handling
  - Test event collection
  - Coverage: Minimum 80% branch coverage

- [ ] **T6.3:** Integration tests for lifecycle
  - Full run: meeting ends normally → `completed{meeting_ended}`
  - Full run: deadline reached → `completed{deadline}`
  - Full run: all retries exhausted → `failed{error}`
  - SIGINT during run → `completed{manual}`
  - Verification: `npm run test -- --run tests/integration/bbb-lifecycle.test.ts`

## Phase 7: Build and Verification

- [ ] **T7.1:** Build check
  ```bash
  npm run build
  ```

- [ ] **T7.2:** Full test suite
  ```bash
  npm test
  ```

---

## Summary

| Phase | Hours | Status |
|-------|-------|--------|
| Phase 1: Types | 0.5 | pending |
| Phase 2: BbbMonitor | 3 | pending |
| Phase 3: BBB Extensions | 2 | pending |
| Phase 4: Graceful Shutdown | 1.5 | pending |
| Phase 5: JobRunner Integration | 1.5 | pending |
| Phase 6: Testing | 3 | pending |
| Phase 7: Verification | 0.5 | pending |
| **Total** | **12.0 hours** | |