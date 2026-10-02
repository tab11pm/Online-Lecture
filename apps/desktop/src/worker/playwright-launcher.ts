import { chromium } from 'playwright';
import type {
  BrowserContextLike,
  BrowserLauncher,
  SessionPage,
} from './tusur-session.js';

export function createPlaywrightLauncher(): BrowserLauncher {
  return async ({ headless, authStatePath }) => {
    const browser = await chromium.launch({ headless });
    let context;
    try {
      context = await browser.newContext(
        authStatePath ? { storageState: authStatePath } : {},
      );
    } catch (error) {
      await browser.close();
      throw error;
    }

    const browserContext: BrowserContextLike = {
      newPage: async (): Promise<SessionPage> => context.newPage(),
      storageState: (options) => context.storageState(options),
      close: async () => {
        try {
          await context.close();
        } finally {
          await browser.close();
        }
      },
    };
    return browserContext;
  };
}
