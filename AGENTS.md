# Repository Guidelines

## Project Structure & Architecture

`SPEC.md` is the source of truth for scope, privacy constraints, and acceptance criteria. A working local automation core plus timetable auto-import is already implemented under `src/`; the Windows Electron application is still pending (design phases 3–4). See `docs/HANDOFF.md` for current state, and `docs/superpowers/specs/` plus `openspec/changes/` for approved designs.

The two deliverables are:

- a local automation core: scheduler, SQLite persistence, SDO MCP client, Playwright/BigBlueButton session management, and `timetable.tusur.ru` auto-import (`src/timetable/`);
- a Windows Electron application with a React/TypeScript renderer, tray integration, onboarding, and installer packaging.

Keep core logic independent of Electron UI and organize tests alongside or in a parallel `tests/` tree. Store fixtures for BBB, MCP, and timetable contract tests under `tests/fixtures/`; never put real session data in the repository.

## Development, Build, and Test Commands

The Node workspace is now initialized with a complete build pipeline. All commands below are functional and documented in `package.json`.

### Core Commands

- `npm test` — execute unit and integration tests (165 tests across 28 files)
- `npm run build` — TypeScript compilation check (`tsc --noEmit`)
- `npm run cli -- <command> [args]` — run CLI commands (note the `--` separator)

### CLI Commands

All commands require `--db <path>` for SQLite database location. Use `--` after `npm run cli` to pass arguments:

```bash
# Auto-import the authenticated student's online lectures from timetable.tusur.ru
npm run cli -- import --db ./data/lectures.db --auth-state ./auth.json

# List all scheduled jobs
npm run cli -- jobs list --db ./data/lectures.db

# Run a scheduled job with direct BBB URL
npm run cli -- run-job <job-id> <occurrence-id> --db ./data/lectures.db

# Run a job with MCP search (course/lecture lookup)
SDO_MCP_SERVER_PATH=/path/to/sdo-mcp npm run cli -- run-job <job-id> <occurrence-id> --db ./data/lectures.db
```

`import` uses the Playwright storage state at `--auth-state` (the shared TUSUR SSO session). `--faculty` and `--group` are optional overrides; otherwise the group is discovered from the authenticated timetable home page. `auth_required` or an incomplete import exits non-zero without modifying the database.

### Environment Variables

- `SDO_MCP_SERVER_PATH` — Path to SDO MCP server executable (optional, defaults to `sdo-mcp`)
- `SDO_AUTH_STATE_PATH` — Path to the shared TUSUR SSO Playwright storage state used by the SDO MCP server
- `MCP_TIMEOUT_MS` — MCP connection timeout in milliseconds (optional, defaults to 5000)

Use OpenSpec to propose and review meaningful changes before implementing them; keep implementation aligned with the approved specification change.

## Coding Style & Naming

Write new application code in TypeScript. Use 2-space indentation, `camelCase` for values and functions, `PascalCase` for React components and classes, and `kebab-case` for file names (for example, `lecture-scheduler.ts`). Keep IPC contracts typed and narrow. Prefer explicit state-machine transitions over implicit boolean flags.

## Testing Guidelines

Cover scheduler timing, occurrence de-duplication, state transitions, retry delays (5/15/30 seconds), secret redaction, and database backup/recovery. For timetable auto-import, cover: online detection via the «реализуется в ЭИОС» note, full discipline names (not `abbr` abbreviations), `lessonId + date` de-duplication across weeks, merge rules (`edited`/`suppressed`/manual preserved, no pruning on incomplete imports), and empty-week vs broken-page parsing. Add MCP contract tests and BBB fixture E2E tests before relying on live university systems. Name tests by observable behavior, e.g. `leaves-at-hard-deadline.test.ts`.

## Security, Commits, and Pull Requests

Never commit passwords, browser profiles, cookies, `sessionToken`s, Moodle join URLs, SQLite databases, logs, or diagnostic archives. Redact these values in errors and test fixtures.

There is no existing Git history to infer commit conventions. Use concise imperative commits such as `feat: add occurrence guard`. Pull requests should describe behavior, tests run, affected OpenSpec change, and screenshots for UI changes. Preserve unrelated uncommitted work.
