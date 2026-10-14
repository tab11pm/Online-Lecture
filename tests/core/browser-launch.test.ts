import { access } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { assertBrowserAvailable } from '../../src/core/browser-launch.js';
import { chromiumExecutablePaths } from '../../src/core/chromium-executables.js';

vi.mock('node:fs/promises', () => ({ access: vi.fn() }));
vi.mock('../../src/core/chromium-executables.js', () => ({
  chromiumExecutablePaths: vi
    .fn()
    .mockReturnValue(['/browsers/chrome', '/browsers/headless-shell']),
}));

describe('assertBrowserAvailable', () => {
  it('explains how to install missing Chromium before an operation', async () => {
    vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT'));
    await expect(assertBrowserAvailable()).rejects.toThrow(
      'Установите Chromium',
    );
  });

  it('lets Edge operations use the system browser', async () => {
    vi.mocked(chromiumExecutablePaths).mockClear();
    await expect(assertBrowserAvailable('msedge')).resolves.toBeUndefined();
    expect(chromiumExecutablePaths).not.toHaveBeenCalled();
  });

  it('requires both full Chromium and its headless shell', async () => {
    vi.mocked(access).mockReset();
    vi.mocked(access).mockImplementation(async (path) => {
      if (path === '/browsers/headless-shell') throw new Error('ENOENT');
    });
    await expect(assertBrowserAvailable()).rejects.toThrow(
      'Установите Chromium',
    );
    expect(access).toHaveBeenCalledWith('/browsers/headless-shell');
  });
});
