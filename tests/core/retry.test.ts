import { describe, expect, it } from 'vitest';

import { nextRetryDelay } from '../../src/core/retry.js';

describe('nextRetryDelay', () => {
  it.each([
    [0, 5_000],
    [1, 15_000],
    [2, 30_000],
    [3, undefined],
  ])(
    'returns %s previous retries as %s milliseconds',
    (previousRetries, expectedDelay) => {
      expect(nextRetryDelay(previousRetries)).toBe(expectedDelay);
    },
  );
});
