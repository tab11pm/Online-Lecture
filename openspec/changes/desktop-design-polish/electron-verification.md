# Electron verification after design polish

The user requested the design commit and continuation to the next project milestone. The next bounded step is to verify the new renderer against the real Electron/preload/worker boundary with synthetic sessions, before native Windows packaging and live university checks.

## Requirements

- Update the opt-in Electron E2E suite to the current accessible UI: candidate buttons, DD.MM.YYYY input, action menus, modal confirmation and distinct empty-error-filter message.
- Every E2E case uses its own temporary LOCALAPPDATA and Electron profile. Fake-session flags stay enabled; no real auth state, credentials, database or university endpoints are used.
- An explicit CI_ELECTRON_E2E=1 run must fail with an actionable error if prerequisites or launch fail. The ordinary desktop test command still skips opt-in cases.
- Check welcome → login → active session, successful lecture/stop/journal, failed lecture/journal and adding/moving/cancelling a lecture.
- Keep changes to test/support infrastructure unless a concrete production regression is reproduced. Do not bypass native/browser security checks to manufacture a pass.
- Native Linux Electron verification is not equivalent to Windows installer verification; report both scope and remaining limitations truthfully.

## Tasks

- [x] Update and isolate E2E tests (Luna 6; controller diff/typecheck/format review).
- [x] Prepare the installed Electron runtime and review prerequisites (controller; Electron 44.5.1 and Playwright Chromium/headless shell 1243).
- [x] Execute opt-in E2E, resolve findings and update the handoff with verified results.

## Native findings

The first enabled run launched the real application but all four cases timed out before credentials. A diagnostic invocation awaiting `getState()` before `checkSession()` succeeded. `CoreProcess.requestState()` coalesces both commands indiscriminately: clicking Start while the initial read is pending reuses that read without sending the session check. Fix this reproduced startup race with a failing regression test, preserving duplicate-read and duplicate-check coalescing, then rebuild and rerun native E2E. Do not add a test-only delay to conceal the race.

Review found that generic state-change pushes can also complete a subsequent queued request: a session check previously emitted both a machine change and an explicit change response. Use one dedicated internal `onboarding.stateResult` event per state-read/session-check command, separate from `onboarding.changed` notifications. Keep different operations serialized, duplicate operations coalesced and queued rejection on stop/timeout/host error. The renderer/preload API is unchanged. Add regressions proving change pushes cannot settle either the active RPC or its queued successor.

The original E2E entry was a JavaScript file, making `app.getAppPath()` point at `out/main` instead of the desktop package. Launching the desktop package directory exercises the production native-module path rather than overriding it; a synthetic import then populated the agenda successfully.

The demo fixture also generated an invalid same-date interval after 22:30 Krasnoyarsk (e.g. 22:38–00:09). The real scheduler correctly did not start it. Fake-session worker mode will use an advancing clock anchored at noon on the current Krasnoyarsk date; real-session mode keeps the real clock. Cover late-evening/midnight startup and elapsed advancement with unit tests. This is test-fixture stabilization, not support for overnight lectures.

## Reproduction command

Build the desktop application (including its Electron-native SQLite module), install the pinned Electron runtime and Playwright Chromium plus headless shell, then run:

```sh
CI_ELECTRON_E2E=1 npm test -w @online-lecture/desktop -- tests/e2e
```

This Linux verification uses `PLAYWRIGHT_BROWSERS_PATH=/tmp/online-lecture-playwright-browsers` for the downloaded test browsers. A GUI/display session is required. None of these runtime binaries or generated test profiles belong in Git.

## Verified results (2026-10-19)

- Full `npm test`: 328 core tests and 333 desktop tests passed; four opt-in cases skipped in this ordinary run.
- Explicit native Electron E2E run: all four passed (welcome/login, successful lecture/stop/journal, failed lecture/journal, add/move/cancel/delete).
- `npm run build` (core TypeScript + desktop typecheck) and desktop production build passed.
- ESLint and Prettier checks for changed TypeScript files passed; `git diff --check` passed.
- Independent Luna review accepted the amended response/push separation with no remaining important findings in scope.

The first sandboxed core run failed two child-server MCP tests; the focused eight-test file and the complete suite passed when rerun outside that sandbox. No MCP production code was changed. Electron E2E likewise requires permission to launch local GUI processes.

Not verified here: Windows installer/Edge, Windows tray and autostart, DPAPI and real TUSUR services.
