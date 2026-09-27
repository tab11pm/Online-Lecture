# Repository Guidelines

## Project Structure & Architecture

This repository currently contains the product specification in `SPEC.md`; implementation files have not yet been created. Treat that document as the source of truth for scope, privacy constraints, and acceptance criteria.

The planned architecture has two deliverables:

- a local automation core: scheduler, SQLite persistence, SDO MCP client, and Playwright/BigBlueButton session management;
- a Windows Electron application with a React/TypeScript renderer, tray integration, onboarding, and installer packaging.

As code is introduced, keep core logic independent of Electron UI and organize tests alongside or in a parallel `tests/` tree. Store fixtures for BBB and MCP contract tests under `tests/fixtures/`; never put real session data in the repository.

## Development, Build, and Test Commands

The Node workspace is now initialized with a complete build pipeline. All commands below are functional and documented in `package.json`.

### Core Commands

- `npm test` — execute unit and integration tests (60 tests across 16 files)
- `npm run build` — TypeScript compilation check (`tsc --noEmit`)
- `npm run cli -- <command> [args]` — run CLI commands (note the `--` separator)

### CLI Commands (Phase B)

All commands require `--db <path>` for SQLite database location. Use `--` after `npm run cli` to pass arguments:

```bash
# List all scheduled jobs
npm run cli -- jobs list --db ./data/lectures.db

# Run a scheduled job with direct BBB URL
npm run cli -- run-job <job-id> <occurrence-id> --db ./data/lectures.db

# Run a job with MCP search (course/lecture lookup)
SDO_MCP_SERVER_PATH=/path/to/sdo-mcp npm run cli -- run-job <job-id> <occurrence-id> --db ./data/lectures.db
```

### Environment Variables

- `SDO_MCP_SERVER_PATH` — Path to SDO MCP server executable (optional, defaults to `sdo-mcp`)
- `MCP_TIMEOUT_MS` — MCP connection timeout in milliseconds (optional, defaults to 5000)

Use OpenSpec to propose and review meaningful changes before implementing them; keep implementation aligned with the approved specification change.

## Coding Style & Naming

Write new application code in TypeScript. Use 2-space indentation, `camelCase` for values and functions, `PascalCase` for React components and classes, and `kebab-case` for file names (for example, `lecture-scheduler.ts`). Keep IPC contracts typed and narrow. Prefer explicit state-machine transitions over implicit boolean flags.

## Testing Guidelines

Cover scheduler timing, occurrence de-duplication, state transitions, retry delays (5/15/30 seconds), secret redaction, and database backup/recovery. Add MCP contract tests and BBB fixture E2E tests before relying on live university systems. Name tests by observable behavior, e.g. `leaves-at-hard-deadline.test.ts`.

## Security, Commits, and Pull Requests

Never commit passwords, browser profiles, cookies, `sessionToken`s, Moodle join URLs, SQLite databases, logs, or diagnostic archives. Redact these values in errors and test fixtures.

There is no existing Git history to infer commit conventions. Use concise imperative commits such as `feat: add occurrence guard`. Pull requests should describe behavior, tests run, affected OpenSpec change, and screenshots for UI changes. Preserve unrelated uncommitted work.
