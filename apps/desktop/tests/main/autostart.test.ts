import { describe, it, expect, vi } from 'vitest';
import { setAutostart, type AutostartApp } from '../../src/main/autostart.js';

describe('setAutostart', () => {
  it('delegates to the login item settings and returns the persisted value', () => {
    const setLoginItemSettings = vi.fn();
    const app: AutostartApp = {
      setLoginItemSettings,
      getLoginItemSettings: () => ({ openAtLogin: true }),
    };

    expect(setAutostart(app, true)).toBe(true);
    expect(setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      args: ['--hidden'],
    });
  });

  it('returns the value read back from the platform, not the requested one', () => {
    const app: AutostartApp = {
      setLoginItemSettings: vi.fn(),
      getLoginItemSettings: () => ({ openAtLogin: false }),
    };

    expect(setAutostart(app, true)).toBe(false);
  });
});
