import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);

interface PlaywrightRegistry {
  registry: {
    findExecutable(name: string): { executablePath(): string } | undefined;
  };
}

/** Resolve both binaries installed by `playwright install chromium`. */
export function chromiumExecutablePaths(): string[] {
  // Resolve relative to Playwright so this registry always matches its browser revision.
  const playwrightRequire = createRequire(
    require.resolve('playwright/package.json'),
  );
  const { registry } = playwrightRequire('playwright-core/lib/coreBundle') as {
    registry: PlaywrightRegistry;
  };
  const headlessShell = registry.registry.findExecutable(
    'chromium-headless-shell',
  );
  if (!headlessShell)
    throw new Error('Playwright Chromium headless shell is unavailable');
  return [chromium.executablePath(), headlessShell.executablePath()];
}
