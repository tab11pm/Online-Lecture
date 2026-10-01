import { describe, expect, it } from 'vitest';
import { createPlaywrightFetcher } from '../../src/timetable/playwright-fetcher.js';

describe('createPlaywrightFetcher', () => {
  it('rejects when the auth state file does not exist', async () => {
    await expect(
      createPlaywrightFetcher({ authStatePath: '/nonexistent/state.json' }),
    ).rejects.toThrow(/auth state/i);
  });
});
