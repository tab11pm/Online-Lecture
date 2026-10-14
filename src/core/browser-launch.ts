import { access } from 'node:fs/promises';
import { chromiumExecutablePaths } from './chromium-executables.js';

export async function assertBrowserAvailable(
  channel?: 'msedge',
): Promise<void> {
  if (channel === 'msedge') {
    return;
  }
  try {
    await Promise.all(chromiumExecutablePaths().map((path) => access(path)));
  } catch {
    throw new Error(
      'Chromium не установлен. Установите Chromium в приложении.',
    );
  }
}
