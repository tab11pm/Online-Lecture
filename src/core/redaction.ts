const URL_PATTERN = /https?:\/\/[^\s"'<>]+/giu;
const TUSUR_HOST_PATTERN = /\b(?:bbb2|sdo)\.tusur\.ru[^\s"'<>]*/giu;
const COOKIE_HEADER_PATTERN = /(cookie\s*:\s*)[^\r\n]+/giu;
const QUERY_PATTERN = /\?[^\s"'<>]*=[^\s"'<>]+/giu;
const SENSITIVE_KEY_PATTERN =
  /\b(sessionToken|sesskey|token|authorization)=[^\s&;]+/giu;

export function redactSensitiveText(text: string): string {
  return text
    .replace(URL_PATTERN, '[REDACTED_URL]')
    .replace(TUSUR_HOST_PATTERN, '[REDACTED_URL]')
    .replace(COOKIE_HEADER_PATTERN, '$1[REDACTED]')
    .replace(QUERY_PATTERN, '?[REDACTED]')
    .replace(SENSITIVE_KEY_PATTERN, '$1=[REDACTED]');
}
