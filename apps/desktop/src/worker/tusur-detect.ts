export const LOGIN_URL = 'https://profile.tusur.ru/';

export const TIMETABLE_URL = 'https://timetable.tusur.ru/';

export const TUSUR_HOSTS = [
  'tusur.ru',
  'profile.tusur.ru',
  'timetable.tusur.ru',
  'sdo.tusur.ru',
] as const;

export type LoginDetection = 'logged_in' | 'captcha' | 'two_factor' | 'form';

const CAPTCHA_MARKERS = [
  'g-recaptcha',
  'recaptcha',
  'hcaptcha',
  'captcha',
] as const;

const TWO_FACTOR_MARKERS = [
  'one-time-code',
  'two-factor',
  'two_factor',
  'код подтверждения',
  'код из sms',
  'код из смс',
] as const;

// A `logged_in` verdict requires a structural authenticated element, never a
// bare `logout`/`auth_cookie` substring from a script or config blob.
const AUTHENTICATED_STRUCTURE_MARKERS = [
  'data-authenticated',
  'data-auth="true"',
  "data-auth='true'",
] as const;

const LOGOUT_LINK_PATTERN =
  /<a\b[^>]*(?:href|class)\s*=\s*["'][^"']*logout[^"']*["']/;

const PASSWORD_FIELD_MARKERS = [
  'type="password"',
  "type='password'",
  'name="password"',
  "name='password'",
] as const;

const FORM_MARKERS = [
  ...PASSWORD_FIELD_MARKERS,
  'name="username"',
  "name='username'",
] as const;

const ALLOWED_HOSTS: ReadonlySet<string> = new Set<string>([
  ...TUSUR_HOSTS,
  new URL(LOGIN_URL).hostname,
]);

function containsAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

/**
 * Only `https:` URLs on the TUSUR allowlist (or the login host) may be loaded.
 */
export function isAllowedTusurUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && ALLOWED_HOSTS.has(url.hostname);
}

/**
 * True when a navigation landed on the SSO login page instead of the
 * authenticated target, e.g. an expired session redirect.
 */
export function isLoginRedirect(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return true;
  }
  if (url.hostname === new URL(LOGIN_URL).hostname) {
    return true;
  }
  return /\/login/i.test(url.pathname);
}

export function detectLoginState(html: string): LoginDetection {
  const text = html.toLowerCase();
  if (containsAny(text, CAPTCHA_MARKERS)) {
    return 'captcha';
  }
  if (containsAny(text, TWO_FACTOR_MARKERS)) {
    return 'two_factor';
  }
  const hasPasswordField = containsAny(text, PASSWORD_FIELD_MARKERS);
  if (!hasPasswordField && hasAuthenticatedStructure(text)) {
    return 'logged_in';
  }
  if (containsAny(text, FORM_MARKERS)) {
    return 'form';
  }
  return 'form';
}

function hasAuthenticatedStructure(text: string): boolean {
  if (containsAny(text, AUTHENTICATED_STRUCTURE_MARKERS)) {
    return true;
  }
  return LOGOUT_LINK_PATTERN.test(text);
}
