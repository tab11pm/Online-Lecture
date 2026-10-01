import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { chromium } from 'playwright';
import { createPlaywrightFetcher } from '../../src/timetable/playwright-fetcher.js';

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn(),
  },
}));

describe('createPlaywrightFetcher', () => {
  let authStatePath: string;
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'tt-fetcher-'));
    authStatePath = join(tempDir, 'state.json');
    await writeFile(authStatePath, '{}');
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('rejects when the auth state file does not exist', async () => {
    await expect(
      createPlaywrightFetcher({ authStatePath: '/nonexistent/state.json' }),
    ).rejects.toThrow(/auth state/i);
    expect(chromium.launch).not.toHaveBeenCalled();
  });

  it('closes the browser when context creation fails', async () => {
    const browser = {
      newContext: vi.fn().mockRejectedValue(new Error('corrupt storage state')),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(chromium.launch).mockResolvedValueOnce(browser as never);

    await expect(createPlaywrightFetcher({ authStatePath })).rejects.toThrow(
      'corrupt storage state',
    );
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it('closes the browser even if closing the context fails', async () => {
    const context = {
      close: vi.fn().mockRejectedValue(new Error('context close failed')),
    };
    const browser = {
      newContext: vi.fn().mockResolvedValue(context),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(chromium.launch).mockResolvedValueOnce(browser as never);

    const fetcher = await createPlaywrightFetcher({ authStatePath });

    await expect(fetcher.close()).rejects.toThrow('context close failed');
    expect(browser.close).toHaveBeenCalledTimes(1);
  });
});
