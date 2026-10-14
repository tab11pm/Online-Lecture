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
  courseId: "Математика"
  lectureQuery: "Онлайн-лекция"
browser:
  headless: false
`;

describe('parseJobConfig', () => {
  it.each([
    ['courseId', 'course', 'target.course is obsolete; use target.courseName'],
    [
      'lectureQuery',
      'lecture',
      'target.lecture is obsolete; use target.lectureQuery',
    ],
  ])(
    'rejects legacy %s key %s with migration guidance',
    (currentKey, legacyKey, diagnostic) => {
      expect(() =>
        parseJobConfig(weeklyConfig.replace(`${currentKey}:`, `${legacyKey}:`)),
      ).toThrow(diagnostic);
    },
  );

  it('rejects a search target with a direct activity URL', () => {
    expect(() =>
      parseJobConfig(
        weeklyConfig.replace(
          'type: search',
          'type: search\n  activityUrl: https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=42',
        ),
      ),
    ).toThrow('target.type=search cannot include activityUrl');
  });

  it('parses a weekly technical YAML job', () => {
    expect(parseJobConfig(weeklyConfig)).toMatchObject({
      id: 'math-monday',
      schedule: { type: 'weekly', days: ['mon'] },
      target: { type: 'search', courseId: 'Математика' },
    });
  });

  it('rejects a target with conflicting direct and search fields', () => {
    expect(() =>
      parseJobConfig(
        weeklyConfig.replace(
          'type: search',
          'type: direct\n  activityUrl: https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=42',
        ),
      ),
    ).toThrow(
      'target.type=direct cannot include courseId, courseName, or lectureQuery',
    );
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
  type: direct
  activityUrl: ${url}
browser:
  headless: false
`),
    ).toThrow(
      'target.activityUrl must be an HTTPS Moodle BigBlueButton activity URL',
    );
  });
});
