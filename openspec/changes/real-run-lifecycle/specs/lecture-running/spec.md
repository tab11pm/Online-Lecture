# Lecture Running Specification

## ADDED Requirements

### REQ-BBB-001: Session Lifecycle States

The system SHALL support the following BBB session states:

- `waiting_room`: User has joined BBB but moderator has not started the meeting
- `connecting`: Initial connection in progress
- `connected`: User successfully joined as listener
- `reconnecting`: Network error, attempting retry
- `leaving`: Session cleanup in progress
- `completed`: Session finished successfully
- `failed`: Session ended with errors
- `blocked`: Session cannot start (auth, ambiguous search)
- `skipped`: Session window already closed

**Rationale:** Required for proper session management and user feedback.

**Scenarios:**

#### Scenario: User joins waiting room

Given a scheduled lecture with `joinAt: 10:00`
When the current time is `10:00` and moderator has not started
Then the session state SHALL be `waiting_room`
And the system SHALL wait for moderator to start

#### Scenario: Moderator starts meeting

Given a session in `waiting_room` state
When moderator starts the meeting
Then the session state SHALL transition to `connected`
And audio SHALL be in listen-only mode

---

### REQ-BBB-002: Deadline Enforcement

The system SHALL enforce a hard `leaveAt` deadline.

**Requirements:**
- The system SHALL check the deadline on each monitoring iteration
- When `now >= leaveAt`, the session SHALL transition to `leaving` state
- The `completionReason` SHALL be set to `deadline`
- No new connections SHALL be attempted after the deadline

**Rationale:** SPEC.md requires hard deadline enforcement.

**Scenarios:**

#### Scenario: Deadline reached during waiting room

Given a session in `waiting_room` state
When `now >= leaveAt`
Then the session SHALL transition to `leaving`
And the `completionReason` SHALL be `deadline`

#### Scenario: Deadline reached during connected

Given a session in `connected` state
When `now >= leaveAt`
Then the session SHALL transition to `leaving`
And the `completionReason` SHALL be `deadline`

#### Scenario: Before deadline, session continues

Given a session in `connected` state
When `now < leaveAt`
Then the session SHALL remain in `connected` state
And monitoring SHALL continue

---

### REQ-BBB-003: Retry Policy

The system SHALL implement retry logic with delays of 5, 15, and 30 seconds.

**Requirements:**
- On network error, the system SHALL retry up to 3 times
- Attempt 0: 5 second delay
- Attempt 1: 15 second delay
- Attempt 2: 30 second delay
- Attempt 3: FAIL, transition to `failed` state with `completionReason: error`

**Rationale:** SPEC.md specifies 5/15/30 retry policy.

**Scenarios:**

#### Scenario: Network error, first retry

Given a session in `connected` state
When a network error occurs
Then the system SHALL transition to `reconnecting` state
And wait 5 seconds before retrying

#### Scenario: Network error, second retry

Given a session in `reconnecting` state (attempt 1)
When the retry fails
Then the system SHALL wait 15 seconds before next retry
And increment retry counter to 2

#### Scenario: Network error, third retry

Given a session in `reconnecting` state (attempt 2)
When the retry fails
Then the system SHALL wait 30 seconds before next retry
And increment retry counter to 3

#### Scenario: All retries exhausted

Given a session in `reconnecting` state (attempt 3)
When the retry fails
Then the system SHALL transition to `failed` state
And set `completionReason` to `error`

---

### REQ-BBB-004: Graceful Shutdown

The system SHALL handle SIGINT and SIGTERM signals gracefully.

**Requirements:**
- On SIGINT/SIGTERM, the system SHALL initiate graceful shutdown
- Current session SHALL transition to `leaving` state
- The `completionReason` SHALL be set to `manual`
- BBB session SHALL be properly closed before exit

**Rationale:** SPEC.md requires proper handling of process signals.

**Scenarios:**

#### Scenario: User sends SIGINT during session

Given a session in `connected` state
When the process receives SIGINT
Then the system SHALL transition to `leaving` state
And set `completionReason` to `manual`
And close the BBB session cleanly

---

### REQ-BBB-005: Meeting End Detection

The system SHALL detect when the meeting ends normally.

**Requirements:**
- The system SHALL monitor for BBB "meeting ended" event
- When detected, transition to `leaving` state
- Set `completionReason` to `meeting_ended`

**Scenarios:**

#### Scenario: Moderator ends meeting

Given a session in `connected` state
When moderator ends the meeting
Then the system SHALL detect meeting end
And transition to `leaving` state
And set `completionReason` to `meeting_ended`

---

### REQ-BBB-006: Moderator Removal Detection

The system SHALL detect when the moderator removes the user.

**Requirements:**
- The system SHALL monitor for BBB "you were removed" event
- When detected, transition to `leaving` state
- Set `completionReason` to `blocked` (per SPEC: "удаление модератором не вызывает повторный вход")

**Scenarios:**

#### Scenario: Moderator removes user

Given a session in `connected` state
When moderator removes the user
Then the system SHALL detect the removal
And transition to `leaving` state
And set `completionReason` to `blocked`
And SHALL NOT attempt reconnection

---

## MODIFIED Requirements

### REQ-CLI-001: Job Execution

The `run-job` command SHALL be modified to:
- Accept `Occurrence` with `leaveAt` parameter
- Pass `leaveAt` to BBB session monitor
- Handle `reconnecting`, `deadline_reached`, `manual_stop` events

**Original:** Simple join/leave without monitoring.

**Updated:** Full lifecycle with monitoring and retry.

---

## REMOVED Requirements

*None for this change.*

---

## Dependencies

- `build-core-cli` MUST be applied first (existing dependency)