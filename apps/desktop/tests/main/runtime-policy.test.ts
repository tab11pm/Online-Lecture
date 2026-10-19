import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeRuntimeEnvironment } from '../../src/main/runtime-policy.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'online-lecture-runtime-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  delete process.env.OL_RUNTIME_SENTINEL;
});

function policyEnv(isPackaged: boolean, overrides: NodeJS.ProcessEnv = {}) {
  return {
    isPackaged,
    appPath: join(root, 'app'),
    resourcesPath: join(root, 'resources'),
    cwd: join(root, 'cwd'),
    platform: 'win32' as const,
    ...overrides,
  };
}

describe('initializeRuntimeEnvironment', () => {
  it('loads .env and points at the app SQLite build in development', () => {
    writeFileSync(
      join(root, '.env'),
      'OL_RUNTIME_SENTINEL=from_file\n',
      'utf8',
    );
    const input = policyEnv(false, { cwd: root });

    const mode = initializeRuntimeEnvironment(input, process.env);

    expect(mode).toBe('development');
    expect(process.env.OL_RUNTIME_SENTINEL).toBe('from_file');
    expect(process.env.ONLINE_LECTURE_SQLITE_BINDING).toBe(
      join(input.appPath, 'native', 'better_sqlite3.node'),
    );
    delete process.env.ONLINE_LECTURE_SQLITE_BINDING;
  });

  it('honours an explicit SQLite binding only in development', () => {
    const env: NodeJS.ProcessEnv = {
      ONLINE_LECTURE_SQLITE_BINDING: '/wrong/better_sqlite3.node',
    };

    initializeRuntimeEnvironment(policyEnv(false), env);

    expect(env.ONLINE_LECTURE_SQLITE_BINDING).toBe(
      '/wrong/better_sqlite3.node',
    );
  });

  it('does not read .env in packaged mode', () => {
    writeFileSync(
      join(root, '.env'),
      'OL_RUNTIME_SENTINEL=unexpected\n',
      'utf8',
    );
    const env: NodeJS.ProcessEnv = {};

    const mode = initializeRuntimeEnvironment(
      policyEnv(true, { cwd: root }),
      env,
    );

    expect(mode).toBe('packaged');
    expect(process.env.OL_RUNTIME_SENTINEL).toBeUndefined();
  });

  it('forces the resource SQLite binding in packaged mode', () => {
    const env: NodeJS.ProcessEnv = {
      ONLINE_LECTURE_SQLITE_BINDING: '/wrong/better_sqlite3.node',
    };

    initializeRuntimeEnvironment(policyEnv(true), env);

    expect(env.ONLINE_LECTURE_SQLITE_BINDING).toBe(
      join(root, 'resources', 'native', 'better_sqlite3.node'),
    );
  });

  it('does not apply Windows browser defaults', () => {
    const env: NodeJS.ProcessEnv = {};

    initializeRuntimeEnvironment(policyEnv(true), env);

    expect('SDO_BROWSER_CHANNEL' in env).toBe(false);
  });
});
