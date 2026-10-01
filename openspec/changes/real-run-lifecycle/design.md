# Design

## Overview

Реализует полный runtime lifecycle BBB-сессии с проверкой deadline, retry политикой и graceful shutdown.

## Architecture

```
JobRunner.runJob(jobId, occurrenceId)
    │
    ├─▶ jobRepo.getById(jobId) → Job
    │       │
    │       └─▶ findActiveOccurrence(job, now) → Occurrence (joinAt, leaveAt, timezone)
    │
    ├─▶ runRepo.getOrCreate() → Run
    │
    ├─▶ bbbManager.startSession(url, config)
    │       └─▶ передаём Occurrence в config
    │
    ├─▶ BbbMonitor.start(session, occurrence, abortSignal) → BbbMonitorResult
    │       │
    │       ├─▶ monitor loop с checkIntervalMs
    │       │   │
    │       │   ├─▶ deadline check (leaveIfDeadlineReached)
    │       │   ├─▶ meeting status (meeting_ended, moderator_removed)
    │       │   └─▶ reconnect logic (nextRetryDelay)
    │       │
    │       └─▶ events: connected, waiting_room, meeting_ended, deadline_reached,
    │                    network_error, moderator_removed, manual_stop
    │
    ├─▶ bbbManager.leaveSession(session)
    │
    └─▶ runRepo.update() с completionReason

GracefulShutdown
    │
    ├─▶ process.on('SIGINT') / process.on('SIGTERM')
    │       └─▶ abortSignal.abort()
    │
    └─▶ completionReason: manual
```

## API

### BbbMonitorConfig (types.ts)

```typescript
export interface BbbMonitorConfig {
  /** How often to poll session state, default 5000ms */
  checkIntervalMs: number;
  /** How often to check deadline, default 1000ms */
  deadlineCheckMs: number;
  /** Maximum session duration, default 4 hours */
  maxSessionMs: number;
}
```

### BbbSessionEvent (types.ts)

```typescript
export type BbbSessionEvent =
  | { type: 'waiting_room'; timestamp: string }
  | { type: 'connected'; timestamp: string }
  | { type: 'meeting_ended'; timestamp: string }
  | { type: 'moderator_removed'; timestamp: string }
  | { type: 'network_error'; error: string; retryAttempt: number }
  | { type: 'deadline_reached'; timestamp: string }
  | { type: 'manual_stop'; timestamp: string };
```

### BbbMonitorResult (types.ts)

```typescript
export interface BbbMonitorResult {
  finalStatus: RunStatus;
  completionReason: CompletionReason;
  events: BbbSessionEvent[];
  durationMs: number;
}
```

### PlaywrightBbbSessionManager (bbb-session.ts)

```typescript
interface PlaywrightBbbSessionManager {
  startSession(url: string, config: SessionConfig, occurrence?: Occurrence): Promise<BbbSession>;
  joinAsListener(session: BbbSession): Promise<void>;
  monitorSession(session: BbbSession): Promise<SessionState>;
  leaveSession(session: BbbSession): Promise<void>;
  // NEW
  waitForModerator(session: BbbSession): Promise<void>;
  detectMeetingEnd(session: BbbSession): Promise<boolean>;
  detectModeratorRemoval(session: BbbSession): Promise<boolean>;
  closeAll(): Promise<void>;
}
```

### GracefulShutdown (graceful-shutdown.ts)

```typescript
export function createGracefulShutdown(): {
  abortController: AbortController;
  install(): void;
  uninstall(): void;
};
```

## State Machine

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BBB Session Lifecycle                        │
└─────────────────────────────────────────────────────────────────────┘

                              ┌──────────────┐
                              │   starting   │
                              └──────┬───────┘
                                     │
                              ┌──────▼───────┐
      ┌───────────────────────▶│   waiting    │
      │                        │    room      │
      │                        └──────┬───────┘
      │                               │ moderator starts meeting
      │                        ┌──────▼───────┐
      │                        │  connecting  │
      │                        └──────┬───────┘
      │                               │ join successful
      │                        ┌──────▼───────┐
      │                        │  connected   │
      │                        └──────┬───────┘
      │                               │
      │    ┌──────────────────────────┼──────────────────────────┐
      │    │                          │                          │
      │    │ network error      deadline reached          manual stop
      │    │                          │                          │
      │    ▼                          ▼                          ▼
      │ ┌──────────────┐      ┌──────────────┐          ┌──────────────┐
      │ │  reconnecting │      │   leaving    │          │   leaving    │
      │ │  (retry loop) │      │  (deadline)  │          │  (manual)    │
      │ └──────┬───────┘      └──────┬───────┘          └──────┬───────┘
      │        │                     │                          │
      │        │ retry ok            │ meeting ends            │ leave button
      │        │                     │                          │
      │        ▼                     ▼                          ▼
      │ ┌──────────────┐      ┌──────────────┐          ┌──────────────┐
      │ │  connecting  │      │   leaving    │          │   leaving    │
      │ └──────┬───────┘      └──────┬───────┘          └──────┬───────┘
      │        │                     │                          │
      │        │ all retries         │                          │
      │        │ exhausted           │                          │
      │        ▼                     ▼                          │
      │ ┌──────────────┐      ┌──────────────┐          ┌──────────────┐
      └─│    failed    │◀─────│   leaving    │◀─────────│   leaving    │
        └──────────────┘      └──────┬───────┘          └──────┬───────┘
                                     │                          │
                                     │                          │
                                     ▼                          ▼
                               ┌──────────────┐          ┌──────────────┐
                               │   completed  │          │   completed  │
                               │  {deadline}  │          │   {manual}   │
                               └──────────────┘          └──────────────┘
```

## Retry Policy

```
Attempt 0:  5 seconds delay  → retry join
Attempt 1: 15 seconds delay  → retry join
Attempt 2: 30 seconds delay  → retry join
Attempt 3: FAIL              → final status: failed, reason: error
```

## BBB Events (requires fixtures)

Для fixture E2E тестов необходимы подтверждённые селекторы BBB UI:

| Event | BBB Selector / Condition | Source |
|-------|-------------------------|--------|
| waiting_room | `[data-testid="waiting-room"]` или CSS `.等待会议室` | BBB HTML fixture |
| moderator_starts | `[data-testid="audio-connected"]` появляется | BBB HTML fixture |
| meeting_ended | `[data-testid="meeting-ended"]` или текст "会议已结束" | BBB HTML fixture |
| moderator_removed | `[data-testid="you-were-removed"]` или текст "您已被主持人移除" | BBB HTML fixture |
| leave_button | `[data-testid="leave-button"]` | BBB HTML fixture |
| listen_only_btn | `button:has-text("Listen Only")` | BBB HTML fixture |

**Out of Scope:** Определение "moderator removed" через эвристику исчезновения leave_button. Требуется позитивный сигнал BBB UI.

## Files to Change

| File | Change |
|------|--------|
| `src/core/types.ts` | Add `BbbMonitorConfig`, `BbbSessionEvent`, `BbbMonitorResult` |
| `src/core/job-runner.ts` | Load Occurrence, pass to session manager, use BbbMonitor |
| `src/core/bbb-session.ts` | Add `waitForModerator()`, `detectMeetingEnd()`, `detectModeratorRemoval()` |
| `src/core/bbb-monitor.ts` | NEW — monitoring loop with deadline/retry |
| `src/core/graceful-shutdown.ts` | NEW — SIGINT/SIGTERM handlers |
| `src/core/scheduler.ts` | Pass full Occurrence to runner |
| `tests/core/bbb-monitor.test.ts` | NEW — unit tests |
| `tests/core/graceful-shutdown.test.ts` | NEW — unit tests |
| `tests/fixtures/bbb-selectors.json` | NEW (dependency: BBB fixture confirmation) |

## Dependencies

1. **BBB Selectors Fixtures** — Required before fixture E2E tests can be written. Create `tests/fixtures/bbb-selectors.json` after manual BBB UI inspection.
2. **build-core-cli** — Must be applied first (existing dependency in .openspec.yaml)