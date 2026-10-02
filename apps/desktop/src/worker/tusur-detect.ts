export const LOGIN_URL = 'https://profile.tusur.ru/';

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

const LOGGED_IN_MARKERS = [
  'data-authenticated',
  'auth_cookie',
  'auth-cookie',
  '/logout',
  'sign out',
  'log out',
  'logout',
  'выход',
] as const;

const FORM_MARKERS = [
  'type="password"',
  "type='password'",
  'name="password"',
  "name='password'",
  'name="username"',
  "name='username'",
] as const;

function containsAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

export function detectLoginState(html: string): LoginDetection {
  const text = html.toLowerCase();
  if (containsAny(text, CAPTCHA_MARKERS)) {
    return 'captcha';
  }
  if (containsAny(text, TWO_FACTOR_MARKERS)) {
    return 'two_factor';
  }
  if (containsAny(text, LOGGED_IN_MARKERS)) {
    return 'logged_in';
  }
  if (containsAny(text, FORM_MARKERS)) {
    return 'form';
  }
  return 'form';
}
