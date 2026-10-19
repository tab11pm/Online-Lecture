import type { RuntimeMode } from '../shared/runtime-mode.js';
import {
  applyPackagedSqliteBinding,
  applySqliteBindingDefault,
  findWorkspaceRoot,
  loadEnvFiles,
} from './load-env.js';

export interface RuntimeEnvironmentInput {
  isPackaged: boolean;
  appPath: string;
  resourcesPath: string;
  cwd: string;
  platform: NodeJS.Platform;
}

/**
 * Establishes the trusted runtime mode before anything else starts.
 *
 * Development keeps reading `.env` files and honours an explicitly configured
 * SQLite binding. Packaged builds never read env files and always point the
 * worker at the native module shipped in `resources/native`.
 */
export function initializeRuntimeEnvironment(
  input: RuntimeEnvironmentInput,
  env: NodeJS.ProcessEnv,
): RuntimeMode {
  if (input.isPackaged) {
    applyPackagedSqliteBinding(env, input.resourcesPath);
    return 'packaged';
  }

  const workspaceRoot =
    findWorkspaceRoot(input.appPath) ?? findWorkspaceRoot(input.cwd);
  loadEnvFiles([
    input.appPath,
    input.cwd,
    ...(workspaceRoot ? [workspaceRoot] : []),
  ]);
  applySqliteBindingDefault(env, input.appPath);
  return 'development';
}
