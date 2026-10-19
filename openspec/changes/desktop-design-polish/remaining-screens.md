# Remaining desktop screens

Continuation approved by the user after the initial eight design fixes. Preserve all existing uncommitted changes and the warm light/dark design system. Renderer-only changes; no core, persistence or IPC changes.

## Reference lock

Primary: current desktop components/styles and the reviewed browser captures `/tmp/design-next-before-*.png` (1000×700). Preserve existing serif headings, sans body, warm surfaces, amber selection, semantic green/red, restrained borders and Lucide icons. Refero Design craft-details.md informs accessible forms, async feedback, focus and error recovery. No new visual language or bitmap assets.

| Decision | Evidence / reference | Reason |
| --- | --- | --- |
| Compact desktop onboarding with the login form visible | credentials/authenticating captures show the form below fold | Put the task before decorative sample schedule |
| Title and outcome on separate lines in journal, readable time and wrapping | journal capture and existing agenda list | Preserve hierarchy for long discipline names and narrow windows |
| Distinguish no records from no errors | journal-empty capture / filter state | An empty error filter is not an empty history |
| Keep loaded records on pagination failure and retry that page | existing journal request flow | Recovery must not reset history or strand loading state after changing filter |
| Completed/current/future import steps, last successful update on error | import-running/error captures and ImportView contract | Explain progress without inventing percentages or data loss |
| State-specific connection heading and guidance | RunStatus contract / SPEC lifecycle | Do not claim connected or listening during search/wait/reconnect |

## Acceptance

- Onboarding: at 1000×700 sign-in fields and submit are visible; at 600px no horizontal overflow. Both themes share consistent spacing and control heights. Browser selection remains available. Pending login, SSO opening and session checking prevent duplicate commands and show meaningful progress/error feedback. Password never enters logs or visible summaries and is cleared after submission. Existing phase transitions and journal suspension work.
- Journal: title, status/reason and time have clear hierarchy and wrap at 600px; counters use Russian plural forms and describe loaded records. Separate loading, initial error, pagination error, empty history and empty error filter states. Retry of pagination preserves loaded entries. Filter changes during pagination cannot leave a permanent loading flag or insert stale results.
- Import: show prior successful update during running/error; steps before active step visibly complete and future steps remain neutral; running button cannot duplicate requests. Complete, partial and failed imports have distinct truthful copy and retry; existing schedule is not presented as erased on failure.
- Lecture state: resolving/joining/waiting/reconnecting/leaving/connected states have truthful labels and guidance; amber/green/red have consistent roles. Stop remains available for active nonterminal states, end time is shown once. No fake retry count, progress percentage or claimed attendance.
- Preview includes newly covered states with safe mock data only. Run meaningful renderer behavior tests, desktop typecheck/build, browser checks of light/dark and 1000×700/600px, and previous design acceptance regression.

## Work split

- Luna 6: App onboarding branches, CredentialsForm, ManualSsoPanel, scoped onboarding stylesheet and onboarding tests only.
- Controller: JournalScreen, ImportPanel, LectureStatus, global style integration, preview scenarios/mocks, relevant tests and independent verification.

## Completed verification

- Luna 6 implemented onboarding; controller reviewed it, implemented journal/import/connection states and integrated settings pending feedback.
- Desktop tests: 318 passed, 4 opt-in Electron E2E tests skipped; desktop typecheck and production build passed.
- Browser matrix: 23 states × 2 themes × 2 widths (1000 and 600px), 92 layouts without horizontal overflow. Sign-in action remains within the first 700px of height.
- Six browser interaction checks passed: login pending/password clearing/recovery, manual SSO waiting, settings session-check busy state, import pending/recovery, pagination retry preserving rows, filter race/long title wrapping. No browser runtime errors.
- All ten previous manual-form/menu/date/deletion browser regressions passed.
- Final typography/header captures and formatting/diff checks passed. Native Windows verification remains separate from this browser-based design pass.
- Luna's final read-only review found first-import recovery copy promising saved data; corrected to conditional reassurance and covered by a regression test. Re-review confirmed the finding addressed.
