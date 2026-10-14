import { access } from 'node:fs/promises';
import { chromium } from 'playwright';
import { assertBrowserAvailable } from '../core/browser-launch.js';
import type { HttpFetcher } from './http-fetcher.js';

const DEFAULT_BASE_URL = 'https://timetable.tusur.ru';

export interface PlaywrightFetcherOptions {
  authStatePath: string;
  baseUrl?: string;
  channel?: 'msedge';
}

export type PlaywrightFetcher = HttpFetcher & { close(): Promise<void> };

export async function createPlaywrightFetcher({
  authStatePath,
  baseUrl = DEFAULT_BASE_URL,
  channel,
}: PlaywrightFetcherOptions): Promise<PlaywrightFetcher> {
  try {
    await access(authStatePath);
  } catch {
    throw new Error(`Auth state file not found: ${authStatePath}`);
  }

  await assertBrowserAvailable(channel);
  const browser = await chromium.launch(channel ? { channel } : undefined);
  let context;
  try {
    context = await browser.newContext({ storageState: authStatePath });
  } catch (error) {
    await browser.close();
    throw error;
  }

  return {
    async get(url: string): Promise<string> {
      const target = new URL(url, baseUrl).toString();
      const page = await context.newPage();
      try {
        const response = await page.goto(target, {
          waitUntil: 'domcontentloaded',
        });
        const contentType = response?.headers()['content-type'] ?? '';
        if (contentType.includes('json')) {
          return (await response?.text()) ?? '';
        }
        return await page.content();
      } finally {
        await page.close();
      }
    },
    async close(): Promise<void> {
      try {
        await context.close();
      } finally {
        await browser.close();
      }
    },
  };
}
