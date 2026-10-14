import { describe, expect, it, vi } from 'vitest';

const doubles = vi.hoisted(() => {
  const page = {
    goto: vi.fn().mockRejectedValue(new Error('navigation failed')),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const browser = {
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return { page, browser, launch: vi.fn().mockResolvedValue(browser) };
});
vi.mock('../../src/core/browser-launch.js', () => ({
  assertBrowserAvailable: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('playwright', () => ({ chromium: { launch: doubles.launch } }));
import { PlaywrightBbbSessionManager } from '../../src/core/bbb-session.js';

describe('BBB start cleanup', () => {
  it('closes a browser when navigation fails after creation', async () => {
    const manager = new PlaywrightBbbSessionManager();
    await expect(
      manager.startSession('https://bbb2.tusur.ru/test', { headless: true }),
    ).rejects.toThrow('navigation failed');
    expect(doubles.page.close).toHaveBeenCalledOnce();
    expect(doubles.browser.close).toHaveBeenCalledOnce();
  });

  it('closes a browser when page creation fails', async () => {
    doubles.browser.newPage.mockRejectedValueOnce(new Error('page failed'));
    const manager = new PlaywrightBbbSessionManager();
    await expect(
      manager.startSession('https://bbb2.tusur.ru/test', { headless: true }),
    ).rejects.toThrow('page failed');
    expect(doubles.browser.close).toHaveBeenCalledTimes(2);
  });
});
