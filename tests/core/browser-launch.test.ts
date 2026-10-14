import { access } from 'node:fs/promises';
import { chromium } from 'playwright';
import { describe, expect, it, vi } from 'vitest';
import { assertBrowserAvailable } from '../../src/core/browser-launch.js';

vi.mock('node:fs/promises', () => ({ access: vi.fn() }));
vi.mock('playwright', () => ({
  chromium: { executablePath: vi.fn().mockReturnValue('/missing/chrome') },
}));

describe('assertBrowserAvailable', () => {
  it('explains how to install missing Chromium before an operation', async () => {
    vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT'));
    await expect(assertBrowserAvailable()).rejects.toThrow(
      'Установите Chromium',
    );
  });

  it('lets Edge operations use the system browser', async () => {
    vi.mocked(chromium.executablePath).mockClear();
    await expect(assertBrowserAvailable('msedge')).resolves.toBeUndefined();
    expect(chromium.executablePath).not.toHaveBeenCalled();
  });
});
