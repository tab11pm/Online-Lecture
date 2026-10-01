import { access } from 'node:fs/promises';
import { chromium } from 'playwright';
import type { HttpFetcher } from './http-fetcher.js';

const DEFAULT_BASE_URL = 'https://timetable.tusur.ru';

export interface PlaywrightFetcherOptions {
  authStatePath: string;
  baseUrl?: string;
}

export type PlaywrightFetcher = HttpFetcher & { close(): Promise<void> };

export async function createPlaywrightFetcher({
  authStatePath,
  baseUrl = DEFAULT_BASE_URL,
}: PlaywrightFetcherOptions): Promise<PlaywrightFetcher> {
  try {
    await access(authStatePath);
  } catch {
    throw new Error(`Auth state file not found: ${authStatePath}`);
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ storageState: authStatePath });

  return {
    async get(url: string): Promise<string> {
      const target = new URL(url, baseUrl).toString();
      const page = await context.newPage();
      try {
        await page.goto(target, { waitUntil: 'domcontentloaded' });
        return await page.content();
      } finally {
        await page.close();
      }
    },
    async close(): Promise<void> {
      await context.close();
      await browser.close();
    },
  };
}
