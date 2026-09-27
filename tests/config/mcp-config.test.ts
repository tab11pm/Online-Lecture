import { describe, it, expect } from 'vitest';
import { loadMcpConfig } from '../../src/config/mcp-config.js';
import type { McpConfig } from '../../src/core/types.js';

describe('MCP Configuration', () => {
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