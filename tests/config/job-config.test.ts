import { describe, expect, it } from 'vitest';

import { parseJobConfig } from '../../src/config/job-config.js';

const weeklyConfig = `
id: math-monday
enabled: true
schedule:
  type: weekly
  days: [mon]
  joinAt: "10:00"
  leaveAt: "11:35"
  timezone: Asia/Krasnoyarsk
target:
  type: search
  course: "Математика"
  lecture: "Онлайн-лекция"
browser:
  headless: false
`;

describe('parseJobConfig', () => {
  it('parses a weekly technical YAML job', () => {
    expect(parseJobConfig(weeklyConfig)).toMatchObject({
      id: 'math-monday',
      schedule: { type: 'weekly', days: ['mon'] },
      target: { type: 'search', course: 'Математика' },
    });
  });

  it('rejects a target with conflicting url and search fields', () => {
    expect(() =>
      parseJobConfig(
        weeklyConfig.replace(
          'type: search',
          'type: url\n  url: https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=42',
        ),
      ),
    ).toThrow('target.type=url cannot include course or lecture');
  });

  it.each([
    'https://bbb2.tusur.ru/html5client/',
    'http://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=42',
    'https://example.com/mod/bigbluebuttonbn/view.php?id=42',
  ])('rejects an unsupported lecture URL: %s', (url) => {
    expect(() =>
      parseJobConfig(`
id: math
enabled: true
schedule:
  type: once
  date: "2026-09-28"
  joinAt: "10:00"
  leaveAt: "11:35"
  timezone: Asia/Krasnoyarsk
target:
  type: url
  url: ${url}
browser:
  headless: false
`),
    ).toThrow('target.url must be an HTTPS Moodle BigBlueButton activity URL');
  });
});
