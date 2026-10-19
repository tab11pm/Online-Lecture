# Windows packaging policy fixes

**Goal:** Close the remaining NSIS per-user-only and packaged browser override findings from `docs/reviews/2026-10-20-windows-packaging.md`.

**Spec:** `openspec/changes/windows-packaging/specs/windows-packaging/spec.md` and the approved Windows packaging design. These are corrections within the existing specification, authorized by the user's instruction to continue after committing the first three fixes.

**Execution:** GPT-6 Luna implements, Codex supervises, a separate Luna reviews. Preserve unrelated `online-lecture-source.zip`. The preceding fixes are committed as `ab25020`.

## Constraints

- Keep the assisted installer (`oneClick: false`), x64, app identity and per-user data paths.
- All install/uninstall paths, including silent execution, elevated launch and `/allusers`, must remain current-user-only without requesting elevation. Preserve data/cache and the existing removal of only the app's own autostart value.
- Use supported NSIS include hooks and the installed electron-builder 26 templates as evidence; do not patch node_modules or introduce a custom installer engine.
- Packaged browser choice comes from saved settings/UI; external `SDO_BROWSER_CHANNEL`, including an empty value, remains a developer-only override. Keep development `.env` support and capture overrides before browser defaults.
- No downloads, real SSO/BBB, publication or Windows acceptance claims on Linux.

## Task 1: Correct the remaining policy gaps

**Files:** `apps/desktop/build/installer.nsh`, `apps/desktop/src/main/runtime-policy.ts`, `apps/desktop/src/main/index.ts`, main/browser policy tests; packaging tests or a narrowly scoped compiler smoke only if they verify actual behavior; `docs/windows-smoke.md` and handoff/OpenSpec status after verification.

- [x] Reproduce the browser override using the real runtime policy and BrowserController; add failing packaged cases for inherited `msedge` and empty channel with saved Chromium. Development preserves both overrides.
- [x] Introduce a small testable policy boundary used by main so external channel is captured only in development; ensure worker/controller receive no packaged override and selected browser options reach MCP consistently.
- [x] Trace installed NSIS templates for installer/uninstaller initialization, mode page, silent mode, elevated launch and `/allusers`. Implement the smallest current-user-only hook solution without changing assisted UI or uninstall data rules.
- [x] Validate NSIS syntax with an available local compiler if possible. Do not build a fake NSIS interpreter or substitute literal source-string assertions for installer behavior. If compiler/Windows is unavailable, explicitly record the limit and add concrete Windows acceptance cases.
- [x] Run targeted regression tests, root typecheck and core suite; run desktop suite with `--no-file-parallelism` because the existing onboarding `readyRadio` test intermittently times out under parallel load. Format/lint modified files and check diff.
- [x] Independent review of policy and NSIS hook order, then resolve findings. Update the review/handoff without claiming actual Windows execution.

## Design ruling

The earlier plan's `perMachine: false` plus `allowElevation: false` options do not by themselves make an assisted installer per-user-only. The approved per-user requirement controls; keep those options and add explicit mode enforcement. Cost if this ruling is wrong: Windows acceptance may require revising the NSIS hook solution, which remains unverified until that acceptance runs.
