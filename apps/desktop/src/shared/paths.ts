import { join } from 'node:path';

export const APP_DATA_DIR_NAME = 'OnlineLecture';

export interface AppPaths {
  root: string;
  database: string;
  authState: string;
  credentials: string;
  settings: string;
  logs: string;
}

export function createAppPaths(userDataDir: string): AppPaths {
  return {
    root: userDataDir,
    database: join(userDataDir, 'data', 'lectures.db'),
    authState: join(userDataDir, 'auth.json'),
    credentials: join(userDataDir, 'credentials.enc'),
    settings: join(userDataDir, 'settings.json'),
    logs: join(userDataDir, 'logs'),
  };
}

/**
 * Data lives under the per-user Local application data directory
 * (`%LOCALAPPDATA%/OnlineLecture` on Windows), not the roaming profile.
 */
export function createAppPathsInLocalAppData(
  localAppDataDir: string,
): AppPaths {
  return createAppPaths(join(localAppDataDir, APP_DATA_DIR_NAME));
}
