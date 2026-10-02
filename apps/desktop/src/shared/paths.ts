import { join } from 'node:path';

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
