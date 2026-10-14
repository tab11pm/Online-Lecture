import { describe, expect, it, vi } from 'vitest';
import { BrowserController } from '../../src/main/browser-controller.js';
import type { BrowserChoice } from '../../src/shared/browser-choice.js';

function setup(
  input: {
    stored?: BrowserChoice;
    available?: boolean;
    externalChannel?: string;
    platform?: NodeJS.Platform;
  } = {},
) {
  let stored = input.stored;
  const settings = {
    read: vi.fn(async () => ({ autostart: false, browser: stored })),
    update: vi.fn(async (patch: { browser?: BrowserChoice }) => {
      stored = patch.browser;
      return { autostart: false, browser: stored };
    }),
  };
  const installer = {
    getState: vi.fn(async () => ({
      status: input.available ? 'available' : 'missing',
    })),
    install: vi.fn(async () => ({ status: 'available' })),
  };
  const core = { setBrowserChoice: vi.fn() };
  const onChanged = vi.fn();
  const controller = new BrowserController({
    settings,
    installer,
    core,
    platform: input.platform ?? 'win32',
    externalChannel: input.externalChannel,
    onChanged,
  });
  return { controller, settings, installer, core, onChanged };
}

describe('BrowserController', () => {
  it('defaults to Edge on Windows and Chromium elsewhere', async () => {
    expect((await setup().controller.getBrowser()).choice).toBe('edge');
    expect(
      (await setup({ platform: 'linux' }).controller.getBrowser()).choice,
    ).toBe('chromium');
  });

  it('does not save Chromium while the executable is missing', async () => {
    const { controller, settings } = setup();
    expect((await controller.setBrowser('chromium')).choice).toBe('edge');
    expect(settings.update).not.toHaveBeenCalled();
  });

  it('selects Chromium after installation succeeds', async () => {
    const { controller, settings, core } = setup();
    expect((await controller.installChromium()).choice).toBe('chromium');
    expect(settings.update).toHaveBeenCalledWith({ browser: 'chromium' });
    expect(core.setBrowserChoice).toHaveBeenCalledWith('chromium');
  });

  it('blocks login when a saved Chromium executable is missing', async () => {
    const { controller } = setup({ stored: 'chromium' });
    await expect(controller.assertReady()).rejects.toThrow(
      'Установите Chromium',
    );
  });

  it('keeps an explicit empty SDO channel and checks its browser', async () => {
    const { controller } = setup({ externalChannel: '' });
    expect(await controller.getBrowser()).toMatchObject({
      externalChannel: '',
    });
    await expect(controller.assertReady()).rejects.toThrow(
      'Установите Chromium',
    );
  });
});
