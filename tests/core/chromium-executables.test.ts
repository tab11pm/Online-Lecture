import { describe, expect, it } from 'vitest';
import { chromiumExecutablePaths } from '../../src/core/chromium-executables.js';

describe('chromiumExecutablePaths', () => {
  it('resolves the full and headless binaries from the installed Playwright version', () => {
    const paths = chromiumExecutablePaths();
    expect(paths).toHaveLength(2);
    expect(paths[0]).toMatch(/chromium[-_]/);
    expect(paths[1]).toMatch(/chromium_headless_shell[-_]/);
  });
});
