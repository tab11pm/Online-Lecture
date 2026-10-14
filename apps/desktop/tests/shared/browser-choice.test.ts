import { describe, expect, it } from 'vitest';
import { browserChannel } from '../../src/shared/browser-choice.js';

describe('browserChannel', () => {
  it('selects Edge for the Edge preference', () => {
    expect(browserChannel('edge')).toBe('msedge');
  });

  it('selects Playwright Chromium for the Chromium preference', () => {
    expect(browserChannel('chromium')).toBeUndefined();
  });
});
