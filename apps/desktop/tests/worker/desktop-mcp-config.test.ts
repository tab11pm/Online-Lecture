import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { McpConfig } from '@core/core/types.js';
import { loadDesktopMcpConfig } from '../../src/worker/desktop-mcp-config.js';

const require = createRequire(import.meta.url);
const bundledScript =
  'C:\\Program Files\\Online Lecture\\resources\\app.asar.unpacked\\node_modules\\sdo_mcp\\dist\\index.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'online-lecture-mcp-'));
  tempDirs.push(dir);
  return dir;
}

describe('loadDesktopMcpConfig', () => {
  it('delegates to the development loader', () => {
    const development: McpConfig = {
      serverPath: 'sdo-mcp',
      args: [],
      source: 'path',
    };
    const loadDevelopment = vi.fn(() => development);

    const config = loadDesktopMcpConfig(
      { runtimeMode: 'development', platform: 'win32' },
      { loadDevelopment },
    );

    expect(config).toBe(development);
    expect(loadDevelopment).toHaveBeenCalledTimes(1);
  });

  it('runs only the bundled entry through Electron Node in packaged mode', () => {
    const config = loadDesktopMcpConfig(
      { runtimeMode: 'packaged', platform: 'win32' },
      {
        env: {
          SDO_MCP_SERVER_PATH: 'C:\\attacker\\server.exe',
          SDO_MCP_SERVER_CWD: 'C:\\attacker',
          DOTENV_CONFIG_PATH: 'C:\\attacker\\.env',
          DOTENV_CONFIG_QUIET: 'false',
          NODE_OPTIONS: '--inspect',
          PATH: 'C:\\Windows',
        },
        execPath: 'C:\\Program Files\\Online Lecture\\OnlineLecture.exe',
        resolveBundled: () => bundledScript,
      },
    );

    expect(config).toMatchObject({
      serverPath: 'C:\\Program Files\\Online Lecture\\OnlineLecture.exe',
      args: [bundledScript],
      source: 'bundled',
      cwd: dirname(bundledScript),
    });
    expect(config.env).toMatchObject({
      ELECTRON_RUN_AS_NODE: '1',
      DOTENV_CONFIG_PATH: 'NUL',
      DOTENV_CONFIG_QUIET: 'true',
      DOTENV_CONFIG_DEBUG: 'false',
    });
    expect(config.env).not.toHaveProperty('SDO_MCP_SERVER_PATH');
    expect(config.env).not.toHaveProperty('SDO_MCP_SERVER_CWD');
    expect(config.env).not.toHaveProperty('NODE_OPTIONS');
  });

  it('uses the null device on Linux and reads the timeout from the environment', () => {
    const config = loadDesktopMcpConfig(
      { runtimeMode: 'packaged', platform: 'linux' },
      {
        env: { MCP_TIMEOUT_MS: '45000' },
        execPath: '/opt/online-lecture/OnlineLecture',
        resolveBundled: () =>
          '/opt/online-lecture/resources/app.asar.unpacked/node_modules/sdo_mcp/dist/index.js',
      },
    );

    expect(config.env?.DOTENV_CONFIG_PATH).toBe('/dev/null');
    expect(config.connectionTimeout).toBe(45_000);
  });

  it('fails clearly when the bundled entry is missing', () => {
    expect(() =>
      loadDesktopMcpConfig(
        { runtimeMode: 'packaged', platform: 'win32' },
        { resolveBundled: () => undefined },
      ),
    ).toThrow('Встроенный SDO MCP не найден');
  });

  it('does not let .env reach the packaged dotenv preload', () => {
    const cwd = makeTempDir();
    writeFileSync(join(cwd, '.env'), 'PACKAGING_SENTINEL=unexpected\n', 'utf8');
    const sdoMcpEntry = require.resolve('sdo_mcp');
    const dotenvConfig = createRequire(sdoMcpEntry).resolve('dotenv/config');
    const script = join(cwd, 'probe.mjs');
    writeFileSync(
      script,
      'console.log(JSON.stringify(process.env.PACKAGING_SENTINEL ? { sentinel: process.env.PACKAGING_SENTINEL } : {}));\n',
      'utf8',
    );

    const packagedConfig = loadDesktopMcpConfig(
      { runtimeMode: 'packaged', platform: 'linux' },
      {
        env: {},
        execPath: process.execPath,
        resolveBundled: () => join(cwd, 'sdo_mcp', 'index.js'),
      },
    );
    const baseEnv: NodeJS.ProcessEnv = {};
    for (const key of ['PATH', 'HOME', 'SystemRoot', 'ComSpec', 'TEMP']) {
      if (process.env[key] !== undefined) baseEnv[key] = process.env[key];
    }

    const packaged = spawnSync(process.execPath, ['-r', dotenvConfig, script], {
      cwd,
      env: { ...baseEnv, ...packagedConfig.env },
      encoding: 'utf8',
    });
    expect(packaged.status).toBe(0);
    expect(packaged.stdout).toBe('{}\n');

    const development = spawnSync(
      process.execPath,
      ['-r', dotenvConfig, script],
      { cwd, env: baseEnv, encoding: 'utf8' },
    );
    expect(development.status).toBe(0);
    expect(development.stdout).toBe(
      `${JSON.stringify({ sentinel: 'unexpected' })}\n`,
    );
  });
});
