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
});
