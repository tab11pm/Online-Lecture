# Desktop design polish

## Why

Browser audit of the existing desktop UI found hidden actions at the default 1000×700 window size, incomplete keyboard behavior, inconsistent date/time and weekday controls, and visual details left over from the previous layout.

## What changes

Keep the existing warm light/dark design system and typed IPC contracts. Improve default-window layout, accessible dialogs and action menus, deterministic Russian date and 24-hour time entry, search/selection flow, validation, and destructive-action confirmation. No scheduler or persistence changes.

## Acceptance criteria

- At 1000×700 the refresh action is visible without scrolling through the agenda; smaller windows have no horizontal overflow.
- Dialogs have an accessible name, modal semantics, initial focus, Tab containment, Escape dismissal when idle, focus restoration and background scroll lock. Their action footer remains visible while content scrolls.
- Action popovers dismiss on Escape, outside pointer interaction and selection, with appropriate keyboard/focus behavior.
- Date entry visibly uses DD.MM.YYYY and time uses HH:MM regardless of browser locale; IPC continues receiving valid YYYY-MM-DD and HH:MM. Invalid/impossible dates and times cannot be saved.
- Search results, not-found and auth-required feedback appear next to search, with explicit candidate confirmation. Required/invalid fields have associated inline messages and focus moves to the first error.
- Weekdays have consistent accent selection and keyboard access; candidate cards retain no visible radio circles.
- Imported-occurrence hiding and manual-job deletion use an app-styled confirmation dialog; cancel never mutates data and pending confirmation cannot submit twice.
- Readability improves for small operational text and skipped rows without making actions appear disabled. Remove orphan card index and duplicate end-time text.
- Existing privacy and scheduling semantics remain intact; renderer tests, typecheck, build and browser checks pass.

## References

User screenshots, existing styles.css tokens, browser audit captures /tmp/design-audit-*.png, and Refero Design craft-details.md (forms, focus, accessible interactions). The user approved implementation of the audited fixes in this conversation.
