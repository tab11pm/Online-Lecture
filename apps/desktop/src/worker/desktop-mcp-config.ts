import { dirname } from 'node:path';
import {
  collectServerEnv,
  DEFAULT_CONNECTION_TIMEOUT_MS,
  loadMcpConfig,
  resolveBundledServer,
} from '@core/config/mcp-config.js';
import type { McpConfig } from '@core/core/types.js';
import type { RuntimeMode } from '../shared/runtime-mode.js';

export interface DesktopMcpConfigInput {
  runtimeMode: RuntimeMode;
  platform: NodeJS.Platform;
}

export interface DesktopMcpConfigDependencies {
  env?: NodeJS.ProcessEnv;
  execPath?: string;
  resolveBundled?: () => string | undefined;
  loadDevelopment?: () => McpConfig;
}

function connectionTimeoutFrom(env: NodeJS.ProcessEnv): number {
  const parsed = parseInt(
    env.SDO_MCP_CONNECTION_TIMEOUT || env.MCP_TIMEOUT_MS || '',
    10,
  );
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_CONNECTION_TIMEOUT_MS;
}

/**
 * MCP configuration for the desktop worker.
 *
 * Development preserves the CLI behaviour, including `SDO_MCP_SERVER_PATH`
 * and `.env`. A packaged build only runs the bundled server through Electron's
 * Node and overrides dotenv options after the safe environment has been
 * assembled, so `.env` files in the working directory cannot take effect.
 */
export function loadDesktopMcpConfig(
  input: DesktopMcpConfigInput,
  deps: DesktopMcpConfigDependencies = {},
): McpConfig {
  if (input.runtimeMode === 'development') {
    return (deps.loadDevelopment ?? (() => loadMcpConfig()))();
  }

  const env = deps.env ?? process.env;
  const script = (deps.resolveBundled ?? (() => resolveBundledServer()))();
  if (!script) {
    throw new Error(
      'Встроенный SDO MCP не найден в установленном приложении. Переустановите Online Lecture.',
    );
  }

  const serverEnv = collectServerEnv(env);
  delete serverEnv.SDO_MCP_SERVER_PATH;
  delete serverEnv.SDO_MCP_SERVER_CWD;
  serverEnv.ELECTRON_RUN_AS_NODE = '1';
  serverEnv.DOTENV_CONFIG_PATH =
    input.platform === 'win32' ? 'NUL' : '/dev/null';
  serverEnv.DOTENV_CONFIG_QUIET = 'true';
  serverEnv.DOTENV_CONFIG_DEBUG = 'false';

  return {
    serverPath: deps.execPath ?? process.execPath,
    args: [script],
    source: 'bundled',
    cwd: dirname(script),
    env: serverEnv,
    connectionTimeout: connectionTimeoutFrom(env),
  };
}
