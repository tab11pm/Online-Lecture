import { describe, it, expect } from 'vitest';
import {
  TRAY_ICON_DATA_URL,
  isPng,
  trayIconBytes,
} from '../../src/main/tray-icon.js';

describe('tray icon', () => {
  it('is a base64 PNG data URL', () => {
    expect(TRAY_ICON_DATA_URL.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('decodes to a non-empty PNG with a valid signature', () => {
    const bytes = trayIconBytes();
    expect(bytes.length).toBeGreaterThan(0);
    expect(isPng(bytes)).toBe(true);
    expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
