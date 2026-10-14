import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { McpConfig, McpServerSource } from '../core/types.js';

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
 * Handshake bound for starting SDO MCP. It is a liveness check, not a
 * responsiveness one: a cold first start on Windows (antivirus scan, cold disk
 * cache, Playwright loading) can take well over 5 seconds.
 */
export const DEFAULT_CONNECTION_TIMEOUT_MS = 30_000;

const ASAR_SEGMENT = /([\\/])app\.asar([\\/])/;

function resolveFromHere(id: string): string {
  return createRequire(import.meta.url).resolve(id);
}

/**
 * Entry point of the installed `sdo_mcp` package (its `main`,
 * `dist/index.js`), or `undefined` when the package is missing or unbuilt.
 * Inside a packaged Electron app the path runs through `app.asar`; a script
 * started as a separate process must come from `app.asar.unpacked` instead.
 */
export function resolveBundledServer(
  resolve: (id: string) => string = resolveFromHere,
  exists: (path: string) => boolean = existsSync,
): string | undefined {
  let script: string;
  try {
    script = resolve('sdo_mcp');
  } catch {
    return undefined;
  }
  const runnable = script.replace(ASAR_SEGMENT, '$1app.asar.unpacked$2');
  return exists(runnable) ? runnable : undefined;
}

export interface LoadMcpConfigDependencies {
  resolveBundled?: () => string | undefined;
  defaultCommand?: () => string;
}

interface ServerCommand {
  source: McpServerSource;
  command: string;
  args: string[];
}

function selectServerCommand(deps: LoadMcpConfigDependencies): ServerCommand {
  const envPath = process.env.SDO_MCP_SERVER_PATH;
  if (envPath && envPath.trim().length > 0) {
    return { source: 'env', ...splitCommandLine(envPath) };
  }
  const script = (deps.resolveBundled ?? resolveBundledServer)();
  if (script) {
    return { source: 'bundled', command: process.execPath, args: [script] };
  }
  const command = (deps.defaultCommand ?? defaultServerCommand)();
  return {
    source: command === 'sdo-mcp' ? 'path' : 'user-install',
    command,
    args: [],
  };
}

/**
 * Load MCP server configuration from environment or defaults.
 *
 * The command comes from, in order: `SDO_MCP_SERVER_PATH`, the installed
 * `sdo_mcp` package run through `process.execPath` (Electron's Node when
 * `ELECTRON_RUN_AS_NODE=1`, plain `node` in the CLI), the per-user install,
 * then `sdo-mcp` on PATH.
 */
export function loadMcpConfig(deps: LoadMcpConfigDependencies = {}): McpConfig {
  const { source, command, args } = selectServerCommand(deps);
  const env = collectServerEnv();
  if (source === 'bundled') {
    env.ELECTRON_RUN_AS_NODE = '1';
  }

  const cwd = process.env.SDO_MCP_SERVER_CWD;
  const parsedTimeout = parseInt(
    process.env.SDO_MCP_CONNECTION_TIMEOUT || process.env.MCP_TIMEOUT_MS || '',
    10,
  );
  const connectionTimeout =
    Number.isFinite(parsedTimeout) && parsedTimeout > 0
      ? parsedTimeout
      : DEFAULT_CONNECTION_TIMEOUT_MS;

  return {
    serverPath: command,
    args,
    source,
    ...(cwd ? { cwd } : {}),
    env,
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
