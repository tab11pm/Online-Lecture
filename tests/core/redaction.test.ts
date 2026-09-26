import { describe, expect, it } from 'vitest';

import { redactSensitiveText } from '../../src/core/redaction.js';

describe('redactSensitiveText', () => {
  it('removes session tokens, cookies, query parameters, and lecture URLs from diagnostics', () => {
    const diagnostic =
      'join https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=42&sesskey=secret ' +
      'then bbb2.tusur.ru/html5client/join?sessionToken=token-123; ' +
      'Cookie: MoodleSession=abc123';

    const result = redactSensitiveText(diagnostic);

    expect(result).not.toContain('secret');
    expect(result).not.toContain('token-123');
    expect(result).not.toContain('abc123');
    expect(result).not.toContain('view.php?id=42');
    expect(result).not.toContain('html5client/join');
    expect(result).toContain('[REDACTED_URL]');
    expect(result).toContain('Cookie: [REDACTED]');
  });
});
