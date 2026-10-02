import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { createAppPaths } from '../../src/shared/paths.js';

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
});
