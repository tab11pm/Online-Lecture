import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildCourseUrl,
  extractSdoCourseId,
  parseCourseLinks,
} from '../../src/timetable/course-mapper.js';

const json = readFileSync('tests/fixtures/timetable/course-links.json', 'utf8');

describe('course mapper', () => {
  it('parses links and extracts the SDO course id', () => {
    const links = parseCourseLinks(json);
    expect(links).toHaveLength(1);
    expect(extractSdoCourseId(links[0]!)).toBe('22413');
  });

  it('returns an empty list for an empty or malformed payload', () => {
    expect(parseCourseLinks('[]')).toEqual([]);
    expect(parseCourseLinks('not json')).toEqual([]);
  });

  it('returns undefined when the url has no id', () => {
    expect(
      extractSdoCourseId({
        url: 'https://sdo.tusur.ru/auth/edu',
        anchor: '',
        group: '',
      }),
    ).toBeUndefined();
  });

  it('builds a Moodle course url', () => {
    expect(buildCourseUrl('22413')).toBe(
      'https://sdo.tusur.ru/course/view.php?id=22413',
    );
  });
});
