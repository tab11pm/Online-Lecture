import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSmokeEnvironment,
  runChildProcess,
  smokePackagedRuntime,
} from '../../scripts/packaged-runtime-smoke.js';
import {
  resolveLaunchMode,
  sanitizePackagedEnvironment,
} from '../e2e/support/electron-app.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'online-lecture-smoke-test-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function touch(path: string): string {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, 'fixture', 'utf8');
  return path;
}

function createRuntimeFixture(): {
  packageDir: string;
  executablePath: string;
  cwd: string;
} {
  const packageDir = join(root, 'Студент Имя', 'Online Lecture');
  const resources = join(packageDir, 'resources');
  const unpacked = join(resources, 'app.asar.unpacked');
  touch(join(resources, 'native', 'better_sqlite3.node'));
  touch(join(unpacked, 'node_modules', 'playwright', 'cli.js'));
  touch(join(unpacked, 'node_modules', 'sdo_mcp', 'dist', 'index.js'));
  writeFileSync(
    join(unpacked, 'node_modules', 'sdo_mcp', 'package.json'),
    JSON.stringify({ name: 'sdo_mcp', main: 'dist/index.js' }),
    'utf8',
  );
  const executablePath = touch(join(root, 'OnlineLecture.exe'));
  const cwd = join(root, 'cwd');
  mkdirSync(cwd, { recursive: true });
  return { packageDir, executablePath, cwd };
}

describe('resolveLaunchMode', () => {
  it('uses the development build when the packaged variable is absent', () => {
    expect(resolveLaunchMode({}, 'linux')).toEqual({ kind: 'development' });
  });

  it('accepts an existing absolute Windows executable', () => {
    const executable = touch(join(root, 'OnlineLecture.exe'));
    expect(
      resolveLaunchMode(
        { ONLINE_LECTURE_PACKAGED_EXECUTABLE: executable },
        'win32',
      ),
    ).toEqual({ kind: 'packaged', executablePath: executable });
  });

  it('rejects the packaged mode outside Windows or with a bad path', () => {
    const executable = touch(join(root, 'OnlineLecture.exe'));
    expect(() =>
      resolveLaunchMode(
        { ONLINE_LECTURE_PACKAGED_EXECUTABLE: executable },
        'linux',
      ),
    ).toThrow('only on Windows');
    expect(() =>
      resolveLaunchMode(
        { ONLINE_LECTURE_PACKAGED_EXECUTABLE: 'relative/OnlineLecture.exe' },
        'win32',
      ),
    ).toThrow('absolute');
    expect(() =>
      resolveLaunchMode(
        { ONLINE_LECTURE_PACKAGED_EXECUTABLE: join(root, 'missing.exe') },
        'win32',
      ),
    ).toThrow('existing file');
  });

  it('removes developer runtime hooks from packaged children', () => {
    const env = sanitizePackagedEnvironment({
      NODE_PATH: '/repo/node_modules',
      NODE_OPTIONS: '--inspect',
      ELECTRON_RUN_AS_NODE: '1',
      SDO_MCP_SERVER_PATH: '/attacker',
      SDO_MCP_SERVER_CWD: '/attacker',
      PATH: '/bin',
    });

    expect(env).toEqual({ PATH: '/bin' });
  });
});

describe('createSmokeEnvironment', () => {
  it('sets dotenv protection without developer resolution variables', () => {
    const env = createSmokeEnvironment('win32', {
      PATH: 'C:\\Windows',
      NODE_PATH: '/repo/node_modules',
      NODE_OPTIONS: '--inspect',
    });

    expect(env).toMatchObject({
      ELECTRON_RUN_AS_NODE: '1',
      DOTENV_CONFIG_PATH: 'NUL',
      DOTENV_CONFIG_QUIET: 'true',
      DOTENV_CONFIG_DEBUG: 'false',
      PATH: 'C:\\Windows',
    });
    expect(env).not.toHaveProperty('NODE_PATH');
    expect(env).not.toHaveProperty('NODE_OPTIONS');
    expect(createSmokeEnvironment('linux', {}).DOTENV_CONFIG_PATH).toBe(
      '/dev/null',
    );
  });
});

describe('smokePackagedRuntime', () => {
  it('runs SQLite, the packaged Playwright CLI and the MCP handshake', async () => {
    const fixture = createRuntimeFixture();
    const calls: { command: string; args: string[]; cwd: string }[] = [];
    let handshake: unknown;
    const runChild = vi.fn(async (command, args, options) => {
      calls.push({ command, args: [...args], cwd: options.cwd });
    });

    await smokePackagedRuntime(fixture, {
      runChild,
      handshake: async (input) => {
        handshake = input;
      },
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.args[0]).toMatch(/sqlite-check\.cjs$/);
    expect(calls[1]?.args.slice(-1)).toEqual(['--version']);
    expect(handshake).toMatchObject({
      executablePath: fixture.executablePath,
      scriptPath: join(
        fixture.packageDir,
        'resources',
        'app.asar.unpacked',
        'node_modules',
        'sdo_mcp',
        'dist',
        'index.js',
      ),
    });
    expect(existsSync(calls[0]?.args[0] ?? '')).toBe(false);
  });

  it('rejects missing native, Playwright or nested SDO MCP resources', async () => {
    const fixture = createRuntimeFixture();
    rmSync(join(fixture.packageDir, 'resources', 'native'), {
      recursive: true,
      force: true,
    });
    await expect(
      smokePackagedRuntime(fixture, {
        runChild: async () => undefined,
        handshake: async () => undefined,
      }),
    ).rejects.toThrow('native SQLite');

    const second = createRuntimeFixture();
    rmSync(
      join(
        second.packageDir,
        'resources',
        'app.asar.unpacked',
        'node_modules',
        'sdo_mcp',
      ),
      { recursive: true, force: true },
    );
    await expect(
      smokePackagedRuntime(second, {
        runChild: async () => undefined,
        handshake: async () => undefined,
      }),
    ).rejects.toThrow('sdo_mcp');
  });

  it('closes and cleans up when a child check fails', async () => {
    const fixture = createRuntimeFixture();
    let scriptPath = '';

    await expect(
      smokePackagedRuntime(fixture, {
        runChild: async (_command, args) => {
          scriptPath = args[0] ?? '';
          throw new Error('packaged runtime check exited with code 1');
        },
        handshake: async () => undefined,
      }),
    ).rejects.toThrow('code 1');
    expect(scriptPath).not.toBe('');
    expect(existsSync(scriptPath)).toBe(false);
  });
});

describe('runChildProcess', () => {
  it('rejects a hanging child and terminates it', async () => {
    const started = Date.now();

    await expect(
      runChildProcess(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], {
        cwd: root,
        env: createSmokeEnvironment(process.platform),
        timeoutMs: 150,
      }),
    ).rejects.toThrow('timed out');

    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
