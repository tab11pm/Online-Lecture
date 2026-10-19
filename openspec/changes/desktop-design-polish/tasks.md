# Tasks

- [x] Luna 6: implement the eight audited UI improvements and relevant behavior tests; no commits.
- [x] Controller: review spec compliance and code quality; independently verify browser layout, focus, date/time validation, confirmation and all relevant regression tests.
- [x] Resolve review findings and provide screenshots with verified results.
- [x] Continue onboarding, journal, import and connection-state polish as specified in remaining-screens.md; verify 318 desktop tests, typecheck/build and browser matrix.

## Verification

- Desktop tests: 299 passed, 4 opt-in E2E tests skipped.
- Desktop typecheck and production build: passed.
- Independent Chromium checks: 10/10 passed, including 1000×700 layout, visible modal footer, keyboard focus/Escape/outside click, once/weekly save payloads, impossible date/time rejection, stale search invalidation, pending deletion, editor payloads, journal suspension/resume and dark layouts at 720/600px.
- Parent review findings resolved: stale search busy flag, removed menu trigger focus reference, modal portal escaping hidden main view, focus restoration after journal resume and deletion of the initiating row, normalized time values, confirmation copy for manual recurrence deletion.
