import { app } from 'electron';
import { createAppPaths, type AppPaths } from '../shared/paths.js';

export function resolveAppPaths(): AppPaths {
  return createAppPaths(app.getPath('userData'));
}
