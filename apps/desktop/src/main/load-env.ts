import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { BrowserChoice } from '../shared/browser-choice.js';

interface PackageJsonWithWorkspaces {
  workspaces?: unknown;
}

function isWorkspaceRoot(dir: string): boolean {
  const manifestPath = join(dir, 'package.json');
  if (!existsSync(manifestPath)) {
    return false;
  }
  try {
    const manifest = JSON.parse(
      readFileSync(manifestPath, 'utf8'),
    ) as PackageJsonWithWorkspaces;
    return manifest.workspaces !== undefined;
  } catch {
    // A malformed manifest is not a workspace root.
    return false;
  }
}

/**
 * Walk up from `startDir` to the nearest npm-workspaces root (the repository
 * root that owns `apps/*`). Returns `undefined` when no such manifest is found
 * (for example, a packaged app that does not ship the monorepo layout).
 */
export function findWorkspaceRoot(startDir: string): string | undefined {
  let current = startDir;
  for (;;) {
    if (isWorkspaceRoot(current)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

/** De-duplicated `.env` paths for the given directories, preserving order. */
export function envFileCandidates(dirs: string[]): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const dir of dirs) {
    const candidate = join(dir, '.env');
    if (!seen.has(candidate)) {
      seen.add(candidate);
      candidates.push(candidate);
    }
  }
  return candidates;
}

/**
 * Load `.env` files from the candidate directories, ignoring missing files.
 *
 * Earlier directories take precedence: `process.loadEnvFile` never overwrites
 * a variable that is already set (an exported variable likewise wins over any
 * file). Callers pass most-specific-first so a local `apps/desktop/.env` can
 * override the repository-root `.env`.
 *
 * @returns the absolute paths of the files that were loaded.
 */
export function loadEnvFiles(dirs: string[]): string[] {
  const loaded: string[] = [];
  for (const file of envFileCandidates(dirs)) {
    if (!existsSync(file)) {
      continue;
    }
    try {
      process.loadEnvFile(file);
      loaded.push(file);
    } catch {
      // A malformed .env must not abort application startup.
    }
  }
  return loaded;
}

/**
 * Desktop defaults for the SDO MCP server environment. On Windows the server
 * drives the preinstalled Edge, so users never download a Playwright browser.
 * A variable the user defined, even as an empty string, is left alone.
 */
export function applyDesktopServerDefaults(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  choice: BrowserChoice = 'edge',
): void {
  if (platform === 'win32' && env.SDO_BROWSER_CHANNEL === undefined) {
    env.SDO_BROWSER_CHANNEL = choice === 'edge' ? 'msedge' : '';
  }
}
