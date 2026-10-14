import { access } from 'node:fs/promises';
import { chromium } from 'playwright';

export async function assertBrowserAvailable(
  channel?: 'msedge',
): Promise<void> {
  if (channel === 'msedge') {
    return;
  }
  try {
    await access(chromium.executablePath());
  } catch {
    throw new Error(
      'Chromium не установлен. Установите Chromium в приложении.',
    );
  }
}
