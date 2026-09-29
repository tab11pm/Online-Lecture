# Real Lecture Run Lifecycle Design

## Goal

Make one scheduled BBB lecture run until a verified terminal event: normal meeting end, the scheduled leave deadline, manual stop, moderator removal, or exhausted technical retries.

## Scope

This design covers the local runtime after a Moodle BBB activity URL is available. It does not add SDO authentication, Electron UI, Windows packaging, or unverified BBB page selectors.

## Chosen Structure

`JobRunner` resolves the lecture URL and owns persistence. It creates a `LectureSessionController` with the selected `Occurrence`, a browser-session port, a clock, a sleeper, and an `AbortSignal`. The controller is the only component that decides lifecycle transitions and completion reasons.

`PlaywrightBbbSessionManager` remains an adapter. It opens and closes the browser and reports normalized observations; it does not choose retry delays, deadlines, or final run statuses. An observation is one of: waiting for moderator, connected, normal meeting end, confirmed moderator removal, or technical failure.

The controller uses `transitionRun` and `completeRun` for every persisted transition. It checks `leaveAt` before each browser operation and while waiting. On a technical failure before `leaveAt`, it retries after 5, 15, and 30 seconds. A fourth failure produces `failed` with completion reason `error`. An aborted signal produces `completed` with completion reason `manual` after the browser is closed.

## Event Rules

- `waiting_room` is persisted only when a BBB-specific waiting-room signal is observed.
- `connected` is persisted only after the browser confirms listen-only connection.
- `meeting_ended` is used only for a positive BBB end-of-meeting signal.
- `moderator_removed` is a positive BBB signal and maps to terminal run status `blocked`; it must not initiate a retry.
- A missing button or a generic disconnected page is never treated as moderator removal.
- At or after `leaveAt`, no join or reconnect attempt begins; the controller closes the session and records `deadline`.

## Cancellation

The CLI process installs SIGINT and SIGTERM handlers around an active run. They abort its controller; they do not call `process.exit()` before `leaveSession` settles. The future Electron manual-stop action uses the same abort path.

## Test Strategy

Unit tests run the controller against a fake browser-session port, injectable clock, and fake sleeper. They verify every transition, no retry after deadline, all retry delays, cancellation, and idempotent cleanup.

Fixture tests validate the Playwright adapter only against captured or deliberately maintained BBB DOM fixtures. Fixture coverage includes waiting-room, connected, meeting-ended, confirmed moderator removal, and network-error views. A real manual smoke test is deferred until a permitted lecture and selectors are available.

## Explicit Dependencies

Before recognizing waiting-room, meeting-ended, or moderator removal in production, the project must record the exact BBB selectors or accessible text in non-secret fixtures. Until then those observations remain unsupported rather than guessed.

## Acceptance Criteria

1. A run remains active after a successful join; one monitor call cannot mark it as ended.
2. Deadline exits work from both waiting-room and connected states.
3. Technical failure retries exactly after 5, 15, and 30 seconds, never after the deadline.
4. Confirmed moderator removal ends as `blocked` and does not retry.
5. SIGINT, SIGTERM, and manual stop close the browser and end with reason `manual`.
6. Unit and fixture tests cover the above without credentials, network access, or real BBB sessions.
