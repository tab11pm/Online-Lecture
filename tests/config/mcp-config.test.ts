import { describe, it, expect } from 'vitest';
import {
  collectServerEnv,
  loadMcpConfig,
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
});
