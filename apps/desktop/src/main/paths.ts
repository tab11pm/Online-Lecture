import { join } from 'node:path';
import { app } from 'electron';
import {
  APP_DATA_DIR_NAME,
  createAppPaths,
  type AppPaths,
} from '../shared/paths.js';

/**
 * `%LOCALAPPDATA%` on Windows. Electron has no `localAppData` path name, so we
 * read the environment variable and fall back to `appData` for Linux dev/CI.
 */
export function resolveLocalAppDataDir(): string {
  const fromEnv = process.env['LOCALAPPDATA'];
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }
  return app.getPath('appData');
}

export function resolveDataRoot(): string {
  return join(resolveLocalAppDataDir(), APP_DATA_DIR_NAME);
}

export function resolveAppPaths(): AppPaths {
  return createAppPaths(resolveDataRoot());
}
