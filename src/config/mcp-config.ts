import type { McpConfig } from '../core/types.js';

/**
 * Load MCP server configuration from environment or defaults
 */
export function loadMcpConfig(): McpConfig {
  const serverPath =
    process.env.SDO_MCP_SERVER_PATH ||
    process.env.HOME + '/.local/bin/sdo-mcp' ||
    'sdo-mcp';

  const connectionTimeout = parseInt(
    process.env.SDO_MCP_CONNECTION_TIMEOUT || '5000',
    10
  );

  return {
    serverPath,
    connectionTimeout,
  };
}

/**
 * Validate MCP configuration
 */
export function validateMcpConfig(config: McpConfig): string[] {
  const errors: string[] = [];

  if (!config.serverPath || config.serverPath.trim().length === 0) {
    errors.push('serverPath is required and must not be empty');
  }

  if (config.connectionTimeout <= 0) {
    errors.push('connectionTimeout must be greater than 0');
  }

  return errors;
}