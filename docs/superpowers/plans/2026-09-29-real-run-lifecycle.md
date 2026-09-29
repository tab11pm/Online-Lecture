# Real Lecture Run Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a BBB lecture run active and safely terminate it for a verified meeting end, schedule deadline, manual stop, moderator removal, or exhausted retries.

**Architecture:** `LectureSessionController` owns lifecycle decisions, time and persistence-facing transitions. A narrow BBB session port reports normalised observations; the Playwright manager implements that port without making scheduling decisions. `JobRunner` resolves the URL, invokes the controller, persists transitions, and always closes the browser.

**Tech Stack:** TypeScript 5.9, Vitest 4, Playwright, Luxon, SQLite repositories.

## Global Constraints

- Keep browser automation local; never log cookies, query parameters, Moodle URLs or session tokens.
- Keep all core logic independent of Electron and reachable through narrow typed ports.
- Use explicit state-machine transitions, not status assignments.
- Retry only at 5, 15 and 30 seconds; never start a retry at or after `leaveAt`.
- Camera and microphone remain disabled for every join attempt.
- Do not infer moderator removal from a missing DOM element; require a positive selector or accessible message recorded in a fixture.
- Do not use real TUSUR credentials or a live lecture in automated tests.

---

## File Map

| File | Responsibility |
| --- | --- |
| `openspec/changes/real-run-lifecycle/*` | Validated change proposal and requirement deltas for this feature. |
| `src/core/types.ts` | Stable lifecycle observation and BBB-session port types. |
| `src/core/lecture-session-controller.ts` | Deadline, retry, cancellation and transition orchestration. |
| `src/core/bbb-session.ts` | Playwright implementation of one observation and session cleanup. |
| `src/core/job-runner.ts` | URL resolution, controller construction, run persistence and final cleanup. |
| `src/cli/index.ts` | Converts SIGINT/SIGTERM into an abort of the active CLI run. |
| `tests/core/lecture-session-controller.test.ts` | Fast deterministic lifecycle tests with a fake clock, sleeper and BBB port. |
| `tests/core/bbb-session.test.ts` | Playwright adapter tests against maintained DOM fixtures. |
| `tests/core/job-runner.test.ts` | Repository and controller integration tests. |
| `tests/fixtures/bbb-lifecycle/*.html` | Non-secret BBB views with documented selectors and expected observation. |

### Task 1: Repair the OpenSpec change before runtime work

**Files:**
- Modify: `openspec/changes/real-run-lifecycle/proposal.md`
- Modify: `openspec/changes/real-run-lifecycle/design.md`
- Modify: `openspec/changes/real-run-lifecycle/tasks.md`
- Modify: `openspec/changes/real-run-lifecycle/specs/lecture-running/spec.md`

**Interfaces:**
- Consumes: [approved lifecycle design](../specs/2026-09-29-real-run-lifecycle-design.md).
- Produces: a strict-valid OpenSpec change with requirements that match the implementation plan.

- [ ] **Step 1: Replace invalid requirement headings with OpenSpec headings**

Use one requirement per externally observable rule, for example:

```md
## ADDED Requirements

### Requirement: Enforce a hard run deadline

The system SHALL stop joining, monitoring, and reconnecting at or after an occurrence's `leaveAt`.

#### Scenario: Deadline during a reconnect delay

- **WHEN** the controller is waiting to retry and the clock reaches `leaveAt`
- **THEN** it SHALL not call the retry operation
- **AND THEN** it SHALL complete the run with reason `deadline`.
```

- [ ] **Step 2: Remove invented statuses and ambiguous mappings**

Use only current `RunStatus` values. Specify that a positive moderator-removal signal produces terminal status `blocked`; do not call `blocked` a completion reason. Specify that unverified selectors are a dependency, not an implemented condition.

- [ ] **Step 3: Make task checkboxes and verification commands exact**

Every runtime task must name its test file and end with one of these commands:

```bash
npm test -- tests/core/lecture-session-controller.test.ts
npm test -- tests/core/bbb-session.test.ts
npm test -- tests/core/job-runner.test.ts
```

- [ ] **Step 4: Validate the proposal**

Run: `openspec validate real-run-lifecycle --strict`

Expected: exit code 0 and no ignored requirement headings.

- [ ] **Step 5: Commit the proposal**

```bash
git add openspec/changes/real-run-lifecycle
git commit -m "docs: specify lecture run lifecycle"
```

### Task 2: Define the lifecycle boundary and prove it with a fake port

**Files:**
- Modify: `src/core/types.ts`
- Create: `src/core/lecture-session-controller.ts`
- Create: `tests/core/lecture-session-controller.test.ts`

**Interfaces:**
- Consumes: `Occurrence`, `Run`, `RunStatus`, `CompletionReason`, `transitionRun`, `completeRun`, `nextRetryDelay`.
- Produces:

```ts
export type BbbObservation =
  | { kind: 'waiting_room' }
  | { kind: 'connected' }
  | { kind: 'meeting_ended' }
  | { kind: 'moderator_removed' }
  | { kind: 'network_error'; message: string };

export interface BbbSessionPort {
  join(session: BbbSession, signal: AbortSignal): Promise<BbbObservation>;
  observe(session: BbbSession, signal: AbortSignal): Promise<BbbObservation>;
  reconnect(session: BbbSession, signal: AbortSignal): Promise<BbbObservation>;
  leave(session: BbbSession): Promise<void>;
}

export interface LectureSessionControllerDependencies {
  now(): Date;
  sleep(milliseconds: number, signal: AbortSignal): Promise<void>;
  update(run: Run): Promise<Run>;
}
```

- [ ] **Step 1: Write a failing controller test for a normal end**

```ts
it('completes a connected run when BBB reports meeting_ended', async () => {
  const port = fakePort({ join: 'connected', observe: 'meeting_ended' });
  const result = await controller.run(startingRun, occurrence, session, port, signal);
  expect(result).toMatchObject({ status: 'completed', completionReason: 'meeting_ended' });
  expect(port.leave).toHaveBeenCalledWith(session);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/core/lecture-session-controller.test.ts`

Expected: FAIL because the controller module does not exist.

- [ ] **Step 3: Add only the port types and normal-end controller path**

The controller shall transition `joining -> connected -> leaving -> completed`, call `dependencies.update` after each transition, and call `port.leave` in `finally`.

- [ ] **Step 4: Verify the passing test**

Run: `npm test -- tests/core/lecture-session-controller.test.ts`

Expected: normal-end test passes without Playwright or timers.

- [ ] **Step 5: Commit the narrow boundary**

```bash
git add src/core/types.ts src/core/lecture-session-controller.ts tests/core/lecture-session-controller.test.ts
git commit -m "feat: add lecture session controller boundary"
```

### Task 3: Add deadline, cancellation, and retry behavior to the controller

**Files:**
- Modify: `src/core/lecture-session-controller.ts`
- Modify: `tests/core/lecture-session-controller.test.ts`

**Interfaces:**
- Consumes: `BbbSessionPort`, `LectureSessionControllerDependencies`, `nextRetryDelay`.
- Produces: terminal results for `deadline`, `manual`, `error`, and `blocked` without direct status assignment.

- [ ] **Step 1: Write failing deadline and abort tests**

```ts
it('does not reconnect once the clock reaches leaveAt', async () => {
  const port = fakePort({ join: 'network_error' });
  dependencies.now.mockReturnValue(new Date(occurrence.leaveAt));
  const result = await controller.run(startingRun, occurrence, session, port, signal);
  expect(port.reconnect).not.toHaveBeenCalled();
  expect(result.completionReason).toBe('deadline');
});

it('completes with manual reason when the signal is aborted', async () => {
  abortController.abort();
  const result = await controller.run(startingRun, occurrence, session, port, abortController.signal);
  expect(result).toMatchObject({ status: 'completed', completionReason: 'manual' });
});
```

- [ ] **Step 2: Implement deadline and abort checks**

Before `join`, `observe`, `sleep`, and `reconnect`, compare `dependencies.now().getTime()` with `Date.parse(occurrence.leaveAt)`. On deadline, transition to `leaving`, call `port.leave`, and `completeRun` with `deadline`. On `signal.aborted`, use the same cleanup path with `manual`.

- [ ] **Step 3: Write a failing retry sequence test**

```ts
it('retries technical failures after 5, 15, and 30 seconds then fails', async () => {
  const port = fakePort({ join: 'network_error', reconnect: ['network_error', 'network_error', 'network_error'] });
  const result = await controller.run(startingRun, occurrence, session, port, signal);
  expect(dependencies.sleep).toHaveBeenNthCalledWith(1, 5_000, signal);
  expect(dependencies.sleep).toHaveBeenNthCalledWith(2, 15_000, signal);
  expect(dependencies.sleep).toHaveBeenNthCalledWith(3, 30_000, signal);
  expect(result).toMatchObject({ status: 'failed', completionReason: 'error' });
});
```

- [ ] **Step 4: Implement retry transitions**

For each `network_error`, transition to `reconnecting`, wait for `nextRetryDelay(attempt)`, transition to `joining`, and invoke `port.reconnect`. If `nextRetryDelay(3)` is undefined, persist `failed` with reason `error`. Never reconnect after deadline or cancellation.

- [ ] **Step 5: Add positive terminal-event tests**

Cover waiting-room followed by connected, and moderator removal. The latter must transition `joining|connected -> leaving -> blocked`, call `port.leave`, and never call `sleep` or `reconnect`.

- [ ] **Step 6: Verify and commit**

Run: `npm test -- tests/core/lecture-session-controller.test.ts`

Expected: normal, deadline, cancellation, three retries, waiting-room, and moderator-removal scenarios pass.

```bash
git add src/core/lecture-session-controller.ts tests/core/lecture-session-controller.test.ts
git commit -m "feat: enforce lecture deadline and retries"
```

### Task 4: Make Playwright report only fixture-backed BBB observations

**Files:**
- Modify: `src/core/bbb-session.ts`
- Modify: `tests/core/bbb-session.test.ts`
- Create: `tests/fixtures/bbb-lifecycle/connected.html`
- Create: `tests/fixtures/bbb-lifecycle/waiting-room.html`
- Create: `tests/fixtures/bbb-lifecycle/meeting-ended.html`
- Create: `tests/fixtures/bbb-lifecycle/moderator-removed.html`

**Interfaces:**
- Consumes: `BbbObservation`, `BbbSessionPort`.
- Produces: `observe(session, signal): Promise<BbbObservation>` implemented by `PlaywrightBbbSessionManager`.

- [ ] **Step 1: Collect and review selectors before writing detection code**

For each fixture, record the exact non-secret selector or accessible text and its expected observation. A real permitted BBB inspection may add selectors; do not fabricate site-specific test IDs. If no positive moderator-removal selector is available, omit that fixture and keep moderator removal unsupported in the adapter.

- [ ] **Step 2: Write failing adapter tests from fixtures**

```ts
it.each([
  ['waiting-room.html', { kind: 'waiting_room' }],
  ['connected.html', { kind: 'connected' }],
  ['meeting-ended.html', { kind: 'meeting_ended' }],
])('maps %s to its BBB observation', async (fixture, expected) => {
  const session = sessionWithFixture(fixture);
  await expect(manager.observe(session, new AbortController().signal)).resolves.toEqual(expected);
});
```

- [ ] **Step 3: Implement one observation pass**

`observe` must first respect `AbortSignal`, then test selectors in documented priority order. It returns `network_error` only for navigation or evaluation exceptions. It must not call `leaveSession`, sleep, or change a `Run`.

- [ ] **Step 4: Verify adapter behavior**

Run: `npm test -- tests/core/bbb-session.test.ts`

Expected: every fixture maps to exactly one observation and a generic missing button does not map to moderator removal.

- [ ] **Step 5: Commit fixture-backed detection**

```bash
git add src/core/bbb-session.ts tests/core/bbb-session.test.ts tests/fixtures/bbb-lifecycle
git commit -m "feat: observe BBB lifecycle events"
```

### Task 5: Integrate the controller with JobRunner and CLI cancellation

**Files:**
- Modify: `src/core/job-runner.ts`
- Modify: `src/cli/index.ts`
- Modify: `tests/core/job-runner.test.ts`
- Create: `tests/cli/run-job-signals.test.ts`

**Interfaces:**
- Consumes: `LectureSessionController`, a `BbbSessionPort`, `findActiveOccurrence`, `RunRepository`.
- Produces: `run-job` starts the full controller and a signal aborts the active invocation.

- [ ] **Step 1: Write a failing JobRunner occurrence test**

```ts
it('passes the active occurrence leaveAt into the lifecycle controller', async () => {
  await runner.runJob('job-1', occurrence.id);
  expect(controller.run).toHaveBeenCalledWith(expect.anything(), occurrence, expect.anything(), expect.anything(), expect.any(AbortSignal));
});
```

- [ ] **Step 2: Make JobRunner obtain the exact occurrence**

Parse `occurrenceId` through a new repository lookup or reconstruct it through the scheduling service; do not use `new Date()` in the controller. If the occurrence is missing or already past `leaveAt`, persist `skipped` and do not open a browser.

- [ ] **Step 3: Replace direct monitor status assignments**

Remove manual assignments such as `dbRun.status = 'connected'`. Pass repository updates to the controller and persist only results returned by `transitionRun` or `completeRun`.

- [ ] **Step 4: Write a failing signal test**

```ts
it('aborts the active run and waits for browser cleanup on SIGINT', async () => {
  const promise = executeCli(['run-job', 'job-1', occurrence.id, '--db', databasePath]);
  process.emit('SIGINT');
  await expect(promise).resolves.toMatchObject({ exitCode: 0, output: expect.stringContaining('manual') });
  expect(manager.leaveSession).toHaveBeenCalledOnce();
});
```

- [ ] **Step 5: Add scoped signal handling**

Install handlers immediately before the controller starts and remove them in `finally`. The handlers only abort the active controller; they do not terminate unrelated CLI commands or call `process.exit()`.

- [ ] **Step 6: Verify and commit integration**

Run: `npm test -- tests/core/job-runner.test.ts tests/cli/run-job-signals.test.ts`

Expected: expiration, normal end, retry exhaustion, moderator removal and SIGINT paths persist the expected terminal status and close the session exactly once.

```bash
git add src/core/job-runner.ts src/cli/index.ts tests/core/job-runner.test.ts tests/cli/run-job-signals.test.ts
git commit -m "feat: run BBB lifecycle through CLI"
```

### Task 6: Run quality gates and record the remaining external blocker

**Files:**
- Modify: `README.md`
- Modify: `openspec/changes/real-run-lifecycle/tasks.md`

**Interfaces:**
- Consumes: completed runtime tests and validated OpenSpec change.
- Produces: developer documentation that states what is locally verified and what requires a permitted live BBB smoke test.

- [ ] **Step 1: Document the exact local verification commands**

Add the controller, adapter, job runner and signal test commands from Tasks 2–5. State that these tests use fixtures and contain no session data.

- [ ] **Step 2: Record the live-smoke prerequisite**

State that a live smoke test requires a permitted lecture, an authenticated local session, and a reviewed set of BBB selectors. Do not include a Moodle URL, cookie, token, login, or password.

- [ ] **Step 3: Run all gates**

```bash
openspec validate real-run-lifecycle --strict
npm run build
npm test
npm run lint
npm run format:check
```

Expected: all commands exit 0. If the pre-existing lint or formatting failures remain, record their filenames as a separate backlog item; do not hide them with blanket ESLint or Prettier ignores.

- [ ] **Step 4: Commit verified documentation**

```bash
git add README.md openspec/changes/real-run-lifecycle/tasks.md
git commit -m "docs: document lecture lifecycle verification"
```

## Plan Self-Review

- Deadline, retry, cancellation, positive terminal events, and explicit state transitions are covered in Tasks 2–5.
- BBB-specific conditions are isolated behind fixtures in Task 4; the plan does not promise selector-based behavior without evidence.
- Type names introduced in Task 2 are used unchanged in Tasks 3–5.
- P0 lifecycle work is separated from SDO MCP, UI and packaging, which remain independently planned backlog items.
