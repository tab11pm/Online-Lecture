import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyPackagedSqliteBinding,
  applySqliteBindingDefault,
  applyDesktopServerDefaults,
  envFileCandidates,
  findWorkspaceRoot,
  loadEnvFiles,
} from '../../src/main/load-env.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'online-lecture-env-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeManifest(dir: string, contents: unknown): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(contents), 'utf8');
}

describe('findWorkspaceRoot', () => {
  it('walks up to the nearest manifest that declares workspaces', () => {
    const repo = join(root, 'repo');
    const app = join(repo, 'apps', 'desktop');
    writeManifest(repo, { name: 'repo', workspaces: ['apps/*'] });
    writeManifest(app, { name: '@online-lecture/desktop' });

    expect(findWorkspaceRoot(app)).toBe(repo);
  });

  it('returns undefined when no workspace manifest exists above', () => {
    const dir = join(root, 'standalone');
    writeManifest(dir, { name: 'standalone' });

    expect(findWorkspaceRoot(dir)).toBeUndefined();
  });
});

describe('envFileCandidates', () => {
  it('joins `.env` per directory and de-duplicates', () => {
    expect(envFileCandidates(['/a', '/b', '/a'])).toEqual([
      join('/a', '.env'),
      join('/b', '.env'),
    ]);
  });
});

describe('loadEnvFiles', () => {
  it('loads an existing `.env` and ignores missing files', () => {
    writeFileSync(join(root, '.env'), 'OL_ENV_TEST_ONE=loaded', 'utf8');

    const loaded = loadEnvFiles([root, join(root, 'missing')]);

    expect(loaded).toEqual([join(root, '.env')]);
    expect(process.env.OL_ENV_TEST_ONE).toBe('loaded');
    delete process.env.OL_ENV_TEST_ONE;
  });

  it('gives earlier directories precedence and never overrides the environment', () => {
    const local = join(root, 'local');
    const repo = join(root, 'repo');
    mkdirSync(local, { recursive: true });
    mkdirSync(repo, { recursive: true });
    writeFileSync(join(local, '.env'), 'OL_ENV_TEST_TWO=local', 'utf8');
    writeFileSync(
      join(repo, '.env'),
      'OL_ENV_TEST_TWO=repo\nOL_ENV_TEST_THREE=from_file',
      'utf8',
    );
    process.env.OL_ENV_TEST_THREE = 'exported';

    loadEnvFiles([local, repo]);

    expect(process.env.OL_ENV_TEST_TWO).toBe('local');
    expect(process.env.OL_ENV_TEST_THREE).toBe('exported');
    delete process.env.OL_ENV_TEST_TWO;
    delete process.env.OL_ENV_TEST_THREE;
  });

  it('ignores a malformed `.env` instead of throwing', () => {
    writeFileSync(join(root, '.env'), 'OL_ENV_TEST_FOUR="unterminated', 'utf8');

    expect(() => loadEnvFiles([root])).not.toThrow();
  });
});

describe('applyDesktopServerDefaults', () => {
  it('selects bundled Chromium when requested on Windows', () => {
    const env: NodeJS.ProcessEnv = {};
    applyDesktopServerDefaults(env, 'win32', 'chromium');
    expect(env.SDO_BROWSER_CHANNEL).toBe('');
  });
  it('sets msedge on Windows when the channel is not defined', () => {
    const env: NodeJS.ProcessEnv = {};

    applyDesktopServerDefaults(env, 'win32');

    expect(env.SDO_BROWSER_CHANNEL).toBe('msedge');
  });

  it('keeps a user-defined channel, including an empty one', () => {
    const empty: NodeJS.ProcessEnv = { SDO_BROWSER_CHANNEL: '' };
    const chrome: NodeJS.ProcessEnv = { SDO_BROWSER_CHANNEL: 'chrome' };

    applyDesktopServerDefaults(empty, 'win32');
    applyDesktopServerDefaults(chrome, 'win32');

    expect(empty.SDO_BROWSER_CHANNEL).toBe('');
    expect(chrome.SDO_BROWSER_CHANNEL).toBe('chrome');
  });

  it('does nothing outside Windows', () => {
    const env: NodeJS.ProcessEnv = {};

    applyDesktopServerDefaults(env, 'linux');

    expect('SDO_BROWSER_CHANNEL' in env).toBe(false);
  });
});

describe('applySqliteBindingDefault', () => {
  it('points the core at the Electron SQLite build inside the app', () => {
    const env: NodeJS.ProcessEnv = {};
    applySqliteBindingDefault(env, join('/app', 'desktop'));
    expect(env.ONLINE_LECTURE_SQLITE_BINDING).toBe(
      join('/app', 'desktop', 'native', 'better_sqlite3.node'),
    );
  });

  it('keeps an explicitly configured binding', () => {
    const env: NodeJS.ProcessEnv = {
      ONLINE_LECTURE_SQLITE_BINDING: '/custom/better_sqlite3.node',
    };
    applySqliteBindingDefault(env, '/app');
    expect(env.ONLINE_LECTURE_SQLITE_BINDING).toBe(
      '/custom/better_sqlite3.node',
    );
  });
});

describe('applyPackagedSqliteBinding', () => {
  it('always uses the native module shipped in resources', () => {
    const env: NodeJS.ProcessEnv = {
      ONLINE_LECTURE_SQLITE_BINDING: '/wrong/better_sqlite3.node',
    };

    applyPackagedSqliteBinding(env, join('/resources'));

    expect(env.ONLINE_LECTURE_SQLITE_BINDING).toBe(
      join('/resources', 'native', 'better_sqlite3.node'),
    );
  });
});
