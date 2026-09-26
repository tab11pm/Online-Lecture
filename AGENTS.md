# Repository Guidelines

## Project Structure & Architecture

This repository currently contains the product specification in `SPEC.md`; implementation files have not yet been created. Treat that document as the source of truth for scope, privacy constraints, and acceptance criteria.

The planned architecture has two deliverables:

- a local automation core: scheduler, SQLite persistence, SDO MCP client, and Playwright/BigBlueButton session management;
- a Windows Electron application with a React/TypeScript renderer, tray integration, onboarding, and installer packaging.

As code is introduced, keep core logic independent of Electron UI and organize tests alongside or in a parallel `tests/` tree. Store fixtures for BBB and MCP contract tests under `tests/fixtures/`; never put real session data in the repository.

## Development, Build, and Test Commands

No build system or package manifest exists yet, so do not invent or document executable commands as if they work. When the Node workspace is added, record the actual commands in `package.json` and update this guide. Expected categories are:

- `npm run dev` — run the local development application.
- `npm test` — execute unit and contract tests.
- `npm run build` — create production artifacts.

Use OpenSpec to propose and review meaningful changes before implementing them; keep implementation aligned with the approved specification change.

## Coding Style & Naming

Write new application code in TypeScript. Use 2-space indentation, `camelCase` for values and functions, `PascalCase` for React components and classes, and `kebab-case` for file names (for example, `lecture-scheduler.ts`). Keep IPC contracts typed and narrow. Prefer explicit state-machine transitions over implicit boolean flags.

## Testing Guidelines

Cover scheduler timing, occurrence de-duplication, state transitions, retry delays (5/15/30 seconds), secret redaction, and database backup/recovery. Add MCP contract tests and BBB fixture E2E tests before relying on live university systems. Name tests by observable behavior, e.g. `leaves-at-hard-deadline.test.ts`.

## Security, Commits, and Pull Requests

Never commit passwords, browser profiles, cookies, `sessionToken`s, Moodle join URLs, SQLite databases, logs, or diagnostic archives. Redact these values in errors and test fixtures.

There is no existing Git history to infer commit conventions. Use concise imperative commits such as `feat: add occurrence guard`. Pull requests should describe behavior, tests run, affected OpenSpec change, and screenshots for UI changes. Preserve unrelated uncommitted work.
