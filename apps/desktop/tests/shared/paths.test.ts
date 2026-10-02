import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import {
  APP_DATA_DIR_NAME,
  createAppPaths,
  createAppPathsInLocalAppData,
} from '../../src/shared/paths.js';

describe('createAppPaths', () => {
  it('derives every path from the userData directory', () => {
    const root = join('data', 'OnlineLecture');
    const paths = createAppPaths(root);
    expect(paths.database).toBe(join(root, 'data', 'lectures.db'));
    expect(paths.authState).toBe(join(root, 'auth.json'));
    expect(paths.credentials).toBe(join(root, 'credentials.enc'));
    expect(paths.settings).toBe(join(root, 'settings.json'));
    expect(paths.logs).toBe(join(root, 'logs'));
  });

  it('roots the app directory under Local app data', () => {
    const localAppData = join('C:', 'Users', 'student', 'AppData', 'Local');
    const paths = createAppPathsInLocalAppData(localAppData);
    expect(paths.root).toBe(join(localAppData, APP_DATA_DIR_NAME));
    expect(paths.authState).toBe(
      join(localAppData, APP_DATA_DIR_NAME, 'auth.json'),
    );
  });
});
