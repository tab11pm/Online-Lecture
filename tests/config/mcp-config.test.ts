import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import {
  collectServerEnv,
  defaultServerCommand,
  loadMcpConfig,
  resolveBundledServer,
} from '../../src/config/mcp-config.js';

describe('MCP Configuration', () => {
  describe('collectServerEnv', () => {
    it('forwards only the variables the server needs', () => {
      const env = collectServerEnv({
        SDO_AUTH_STATE_PATH: '/x/auth.json',
        SDO_URL: 'https://sdo.tusur.ru',
        MCP_TIMEOUT_MS: '30000',
        HEADLESS: 'true',
        DISPLAY: ':0',
        PATH: '/usr/bin',
        UNRELATED_SECRET: 'nope',
      });

      expect(env).toEqual({
        SDO_AUTH_STATE_PATH: '/x/auth.json',
        SDO_URL: 'https://sdo.tusur.ru',
        MCP_TIMEOUT_MS: '30000',
        HEADLESS: 'true',
        DISPLAY: ':0',
      });
    });
  });

  describe('loadMcpConfig', () => {
    it('should return a valid McpConfig object', () => {
      const config = loadMcpConfig();

      expect(config).toBeDefined();
      expect(config).toHaveProperty('serverPath');
      expect(config).toHaveProperty('connectionTimeout');
    });

    it('should have serverPath as string', () => {
      const config = loadMcpConfig();

      expect(typeof config.serverPath).toBe('string');
      expect(config.serverPath.length).toBeGreaterThan(0);
    });

    it('should have connectionTimeout as number', () => {
      const config = loadMcpConfig();

      expect(typeof config.connectionTimeout).toBe('number');
      expect(config.connectionTimeout).toBeGreaterThan(0);
    });

    it('should support environment variable overrides', () => {
      const originalPath = process.env.SDO_MCP_SERVER_PATH;

      process.env.SDO_MCP_SERVER_PATH = '/custom/path/to/sdo-mcp';

      const config = loadMcpConfig();

      expect(config.serverPath).toBe('/custom/path/to/sdo-mcp');

      if (originalPath) {
        process.env.SDO_MCP_SERVER_PATH = originalPath;
      } else {
        delete process.env.SDO_MCP_SERVER_PATH;
      }
    });

    it('should split a command line into the executable and arguments', () => {
      const originalPath = process.env.SDO_MCP_SERVER_PATH;
      process.env.SDO_MCP_SERVER_PATH = 'node /opt/sdo/dist/index.js';

      const config = loadMcpConfig();

      expect(config.serverPath).toBe('node');
      expect(config.args).toEqual(['/opt/sdo/dist/index.js']);

      if (originalPath) {
        process.env.SDO_MCP_SERVER_PATH = originalPath;
      } else {
        delete process.env.SDO_MCP_SERVER_PATH;
      }
    });

    it('should read the working directory from SDO_MCP_SERVER_CWD', () => {
      const originalCwd = process.env.SDO_MCP_SERVER_CWD;
      process.env.SDO_MCP_SERVER_CWD = '/opt/sdo';

      const config = loadMcpConfig();

      expect(config.cwd).toBe('/opt/sdo');

      if (originalCwd) {
        process.env.SDO_MCP_SERVER_CWD = originalCwd;
      } else {
        delete process.env.SDO_MCP_SERVER_CWD;
      }
    });

    it('should accept MCP_TIMEOUT_MS as a connection timeout fallback', () => {
      const originalConnection = process.env.SDO_MCP_CONNECTION_TIMEOUT;
      const originalFallback = process.env.MCP_TIMEOUT_MS;
      delete process.env.SDO_MCP_CONNECTION_TIMEOUT;
      process.env.MCP_TIMEOUT_MS = '30000';

      const config = loadMcpConfig();

      expect(config.connectionTimeout).toBe(30000);

      if (originalConnection) {
        process.env.SDO_MCP_CONNECTION_TIMEOUT = originalConnection;
      }
      if (originalFallback) {
        process.env.MCP_TIMEOUT_MS = originalFallback;
      } else {
        delete process.env.MCP_TIMEOUT_MS;
      }
    });

    it('should use default values when env vars not set', () => {
      const originalPath = process.env.SDO_MCP_SERVER_PATH;
      delete process.env.SDO_MCP_SERVER_PATH;

      const config = loadMcpConfig();

      expect(config).toBeDefined();
      expect(config.serverPath).toBeDefined();
      expect(config.connectionTimeout).toBe(5000);

      if (originalPath) {
        process.env.SDO_MCP_SERVER_PATH = originalPath;
      }
    });
  });

  describe('defaultServerCommand', () => {
    it('uses the per-user install when it exists, keeping spaces in the path', () => {
      const home = 'C:\\Users\\Ivan Petrov';
      const expected = join(home, '.local', 'bin', 'sdo-mcp');

      expect(defaultServerCommand(home, (path) => path === expected)).toBe(
        expected,
      );
    });

    it('falls back to sdo-mcp on PATH when the per-user install is missing', () => {
      expect(defaultServerCommand('/home/student', () => false)).toBe(
        'sdo-mcp',
      );
    });

    it('falls back to sdo-mcp on PATH when there is no home directory', () => {
      expect(defaultServerCommand('', () => true)).toBe('sdo-mcp');
    });
  });

  describe('resolveBundledServer', () => {
    it('returns the resolved entry point of the installed package', () => {
      const script = join(
        '/repo',
        'node_modules',
        'sdo_mcp',
        'dist',
        'index.js',
      );

      expect(
        resolveBundledServer(
          () => script,
          () => true,
        ),
      ).toBe(script);
    });

    it('returns undefined when the package is not installed', () => {
      expect(
        resolveBundledServer(
          () => {
            throw new Error('MODULE_NOT_FOUND');
          },
          () => true,
        ),
      ).toBeUndefined();
    });

    it('returns undefined when the entry point file is missing', () => {
      expect(
        resolveBundledServer(
          () => '/repo/node_modules/sdo_mcp/dist/index.js',
          () => false,
        ),
      ).toBeUndefined();
    });

    it('maps a path inside app.asar to app.asar.unpacked', () => {
      const packed = join(
        'C:',
        'App',
        'resources',
        'app.asar',
        'node_modules',
        'sdo_mcp',
        'dist',
        'index.js',
      );
      const unpacked = join(
        'C:',
        'App',
        'resources',
        'app.asar.unpacked',
        'node_modules',
        'sdo_mcp',
        'dist',
        'index.js',
      );

      expect(
        resolveBundledServer(
          () => packed,
          (path) => path === unpacked,
        ),
      ).toBe(unpacked);
    });

    it('maps a Windows-style app.asar path to app.asar.unpacked', () => {
      const packed =
        'C:\\App\\resources\\app.asar\\node_modules\\sdo_mcp\\dist\\index.js';
      const unpacked =
        'C:\\App\\resources\\app.asar.unpacked\\node_modules\\sdo_mcp\\dist\\index.js';

      expect(
        resolveBundledServer(
          () => packed,
          (path) => path === unpacked,
        ),
      ).toBe(unpacked);
    });
  });

  describe('loadMcpConfig server source', () => {
    function withServerPath<T>(value: string | undefined, run: () => T): T {
      const original = process.env.SDO_MCP_SERVER_PATH;
      if (value === undefined) {
        delete process.env.SDO_MCP_SERVER_PATH;
      } else {
        process.env.SDO_MCP_SERVER_PATH = value;
      }
      try {
        return run();
      } finally {
        if (original === undefined) {
          delete process.env.SDO_MCP_SERVER_PATH;
        } else {
          process.env.SDO_MCP_SERVER_PATH = original;
        }
      }
    }

    const script = '/repo/node_modules/sdo_mcp/dist/index.js';

    it('uses SDO_MCP_SERVER_PATH even when the package is installed', () => {
      const config = withServerPath('node /dev/sdo/dist/index.js', () =>
        loadMcpConfig({ resolveBundled: () => script }),
      );

      expect(config).toMatchObject({
        source: 'env',
        serverPath: 'node',
        args: ['/dev/sdo/dist/index.js'],
      });
      expect(config.env?.ELECTRON_RUN_AS_NODE).toBeUndefined();
    });

    it('runs the installed package through process.execPath', () => {
      const config = withServerPath(undefined, () =>
        loadMcpConfig({ resolveBundled: () => script }),
      );

      expect(config.source).toBe('bundled');
      expect(config.serverPath).toBe(process.execPath);
      expect(config.args).toEqual([script]);
      expect(config.env?.ELECTRON_RUN_AS_NODE).toBe('1');
    });

    it('keeps a package path with spaces and Cyrillic as a single argument', () => {
      const spaced =
        'C:\\Users\\Иван Петров\\app\\node_modules\\sdo_mcp\\dist\\index.js';
      const config = withServerPath(undefined, () =>
        loadMcpConfig({ resolveBundled: () => spaced }),
      );

      expect(config.args).toEqual([spaced]);
    });

    it('falls back to the user install, then to sdo-mcp on PATH', () => {
      const userInstall = withServerPath(undefined, () =>
        loadMcpConfig({
          resolveBundled: () => undefined,
          defaultCommand: () => '/home/student/.local/bin/sdo-mcp',
        }),
      );
      const onPath = withServerPath(undefined, () =>
        loadMcpConfig({
          resolveBundled: () => undefined,
          defaultCommand: () => 'sdo-mcp',
        }),
      );

      expect(userInstall).toMatchObject({
        source: 'user-install',
        serverPath: '/home/student/.local/bin/sdo-mcp',
        args: [],
      });
      expect(onPath).toMatchObject({ source: 'path', serverPath: 'sdo-mcp' });
    });
  });
});
