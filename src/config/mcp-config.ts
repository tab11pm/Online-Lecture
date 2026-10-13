import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { McpConfig } from '../core/types.js';

/**
 * Split a command line into the executable and its arguments.
 * Supports single and double quoted segments.
 */
export function splitCommandLine(input: string): {
  command: string;
  args: string[];
} {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;

  for (const char of input) {
    if (quote !== undefined) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
    } else if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return { command: tokens[0] ?? '', args: tokens.slice(1) };
}

const FORWARDED_ENV_PATTERN = /^(SDO_|MCP_|BBB_|TUSUR_|HEADLESS$)/;

// Needed so a GUI browser-launching MCP server can actually open a window.
const FORWARDED_ENV_KEYS = new Set([
  'DISPLAY',
  'WAYLAND_DISPLAY',
  'XDG_RUNTIME_DIR',
  'XDG_SESSION_TYPE',
  'XAUTHORITY',
  'DBUS_SESSION_BUS_ADDRESS',
]);

/**
 * Variables the MCP server needs, forwarded from the CLI environment.
 * The stdio transport otherwise inherits only a small safe allowlist.
 */
export function collectServerEnv(
  source: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(source)) {
    if (
      value !== undefined &&
      (FORWARDED_ENV_PATTERN.test(key) || FORWARDED_ENV_KEYS.has(key))
    ) {
      env[key] = value;
    }
  }

  return env;
}

/**
 * Server command used when `SDO_MCP_SERVER_PATH` is unset: the per-user
 * install when it exists, otherwise `sdo-mcp` looked up on PATH. The path is
 * returned as a single executable and never split, so a home directory with
 * spaces (common on Windows) stays intact.
 */
export function defaultServerCommand(
  home: string = homedir(),
  exists: (path: string) => boolean = existsSync,
): string {
  if (home) {
    const userInstall = join(home, '.local', 'bin', 'sdo-mcp');
    if (exists(userInstall)) {
      return userInstall;
    }
  }
  return 'sdo-mcp';
}

/**
 * Load MCP server configuration from environment or defaults
 */
export function loadMcpConfig(): McpConfig {
  const envPath = process.env.SDO_MCP_SERVER_PATH;
  const { command, args } =
    envPath && envPath.trim().length > 0
      ? splitCommandLine(envPath)
      : { command: defaultServerCommand(), args: [] };

  const cwd = process.env.SDO_MCP_SERVER_CWD;
  const connectionTimeout = parseInt(
    process.env.SDO_MCP_CONNECTION_TIMEOUT ||
      process.env.MCP_TIMEOUT_MS ||
      '5000',
    10,
  );

  return {
    serverPath: command,
    args,
    ...(cwd ? { cwd } : {}),
    env: collectServerEnv(),
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

  if ((config.connectionTimeout ?? 0) <= 0) {
    errors.push('connectionTimeout must be greater than 0');
  }

  return errors;
}
