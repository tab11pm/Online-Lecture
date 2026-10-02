import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LOGIN_URL,
  TIMETABLE_URL,
  TUSUR_HOSTS,
  detectLoginState,
  isAllowedTusurUrl,
  isLoginRedirect,
} from '../../src/worker/tusur-detect.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  readFileSync(join(here, '../fixtures/tusur', name), 'utf8');

describe('detectLoginState', () => {
  it('detects the login form', () =>
    expect(detectLoginState(fixture('login-form.html'))).toBe('form'));
  it('detects captcha', () =>
    expect(detectLoginState(fixture('captcha.html'))).toBe('captcha'));
  it('detects two-factor', () =>
    expect(detectLoginState(fixture('two-factor.html'))).toBe('two_factor'));
  it('detects an authenticated page', () =>
    expect(detectLoginState(fixture('logged-in.html'))).toBe('logged_in'));
  it('falls back to form for unrecognized markup', () =>
    expect(detectLoginState('<html><body>hello</body></html>')).toBe('form'));
  it('prefers the captcha marker over the embedded login form', () => {
    const html = `${fixture('login-form.html')}${fixture('captcha.html')}`;
    expect(detectLoginState(html)).toBe('captcha');
  });
  it('prefers the two-factor marker over the embedded login form', () => {
    const html = `${fixture('login-form.html')}${fixture('two-factor.html')}`;
    expect(detectLoginState(html)).toBe('two_factor');
  });
  it('does not trust a logout/auth_cookie substring in a login page config', () => {
    expect(detectLoginState(fixture('login-with-logout-config.html'))).toBe(
      'form',
    );
  });
  it('does not trust a bare logout substring without a structural element', () => {
    expect(
      detectLoginState('<html><script>var r = "/logout";</script></html>'),
    ).toBe('form');
  });
});

describe('TUSUR URL policy', () => {
  it('allows https URLs on the TUSUR allowlist and the login host', () => {
    expect(isAllowedTusurUrl(LOGIN_URL)).toBe(true);
    expect(isAllowedTusurUrl(TIMETABLE_URL)).toBe(true);
    expect(isAllowedTusurUrl('https://sdo.tusur.ru/course')).toBe(true);
  });
  it('rejects non-https and off-allowlist hosts', () => {
    expect(isAllowedTusurUrl('http://profile.tusur.ru/')).toBe(false);
    expect(isAllowedTusurUrl('https://example.com/')).toBe(false);
    expect(isAllowedTusurUrl('not a url')).toBe(false);
  });
  it('detects a redirect back to the SSO login page', () => {
    expect(isLoginRedirect(LOGIN_URL)).toBe(true);
    expect(isLoginRedirect('https://timetable.tusur.ru/login')).toBe(true);
    expect(isLoginRedirect(TIMETABLE_URL)).toBe(false);
  });
});

describe('TUSUR constants', () => {
  it('points the login URL at the TUSUR profile host', () =>
    expect(LOGIN_URL).toBe('https://profile.tusur.ru/'));
  it('allowlists TUSUR hosts', () => {
    expect(TUSUR_HOSTS).toContain('profile.tusur.ru');
    expect(TUSUR_HOSTS).toContain('timetable.tusur.ru');
  });
});
