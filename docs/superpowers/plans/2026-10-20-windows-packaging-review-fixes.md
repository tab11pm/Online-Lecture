# Windows packaging review fixes

> **For agentic workers:** Use superpowers:subagent-driven-development; implementation is assigned to GPT-6 Luna at the user's request.

**Goal:** Close the three confirmed packaging review findings within the approved Windows packaging scope.

**Architecture:** Strengthen the existing inventory validator, connect the existing runtime smoke to the opt-in packaged E2E, and reject browser profile resources. Keep the core and application UI unchanged.

**Tech Stack:** TypeScript, Vitest, Electron, Playwright, electron-builder, ASAR.

**Spec:** `openspec/changes/windows-packaging/specs/windows-packaging/spec.md` and `docs/superpowers/plans/2026-10-19-windows-packaging.md`.

## Global Constraints

- Windows x64 NSIS remains per-user; no publishing or real SSO/BBB calls.
- Chromium is not bundled or downloaded automatically.
- Never include sessions, browser profiles, user databases, logs, or credentials in packages or fixtures.
- Preserve LICENSE/NOTICE and legitimate third-party resources.
- Linux checks do not constitute Windows acceptance; leave actual Windows checks pending.
- Preserve unrelated `online-lecture-source.zip`; leave changes uncommitted for review.

## Review Focus

- Manifest-only runtime dependencies must be rejected before NSIS.
- Critical CLI/entry paths must stay inside the package and support spaces/Cyrillic.
- Explicit packaged E2E must invoke the real runtime smoke and propagate its failure.
- Browser profile directories and recognisable session files must be rejected inside ASAR and unpacked resources.
- Production dependencies with exports or non-runtime metadata must not be rejected indiscriminately.

### Task 1: Close the packaging verification gaps

**Files:** `apps/desktop/scripts/packaged-app-check.ts`, `apps/desktop/scripts/packaged-runtime-smoke.ts`, `apps/desktop/tests/packaging/packaged-app-check.test.ts`, `apps/desktop/tests/packaging/package-windows.test.ts`, `apps/desktop/tests/packaging/packaged-runtime.test.ts`, `apps/desktop/tests/e2e/packaged-runtime.test.ts`; related E2E helper and Windows smoke documentation only as necessary.

**Interfaces:** Keep `verifyPackagedApplication(input)` and `smokePackagedRuntime(input, deps?)`; wire the latter to an actual opt-in packaged E2E execution path with isolated cwd and real packaged executable/resources. Do not execute it in ordinary unit tests against fake PE files.

- [x] Add regression tests and observe expected failures: missing MCP entry, missing Playwright CLI, missing SQLite JS entry; package escape; ASAR and unpacked `profiles/Default/Cookies`; packaged smoke invocation/failure propagation.
- [x] Validate actual critical runtime entry/CLI paths from packaged manifests/resources; do not rely on workspace resolution or attempt to execute third-party modules during static inventory validation.
- [x] Reject browser profile directories/session files across ASAR and unpacked paths with safe relative-path diagnostics; retain legitimate third-party resources.
- [x] Connect real runtime smoke to packaged E2E before GUI assertions; keep ordinary tests browser/network free. Ensure child environment cannot resolve developer Node via PATH.
- [x] Update fixture trees to contain realistic minimal critical runtime files; add Windows smoke instructions and record limitations honestly.
- [x] Run focused packaging tests, then `npm test`, `npm run build`, formatting/lint of modified files and `git diff --check`; report output and any environment blockers. Default parallel desktop runs exposed the previously documented onboarding radio timeout; the affected renderer file passed 23/23 separately. No renderer implementation was changed.

## Coordination

This is one grouped task because validator, package fixtures and packaged smoke share contracts. The user has already authorized these exact fixes and the Luna execution method; no additional design approval is required. Work in the current checkout so the user can inspect changes, preserving unrelated files; no commits, merge or publication.
