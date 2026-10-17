import { describe, expect, it } from 'vitest';
import { ManualTargetStore, parseManualQuery } from '../../src/worker/manual-targets.js';

describe('manual target drafts', () => {
  it('accepts only a course URL on the trusted SDO host', () => {
    expect(parseManualQuery('https://sdo.tusur.ru/course/view.php?id=42')).toEqual({ courseUrl: 'https://sdo.tusur.ru/course/view.php?id=42' });
    expect(parseManualQuery('Алгебра')).toEqual({ courseQuery: 'Алгебра' });
    for (const query of ['https://evil.test/course/view.php?id=42', 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=42', 'https://sdo.tusur.ru/course/view.php?id=42&token=secret', '']) {
      expect(() => parseManualQuery(query)).toThrow();
    }
  });

  it('returns opaque safe candidates and invalidates old drafts on a new lookup', () => {
    const store = new ManualTargetStore();
    const first = store.remember({ status: 'resolved', course: { id: '1', name: 'Алгебра' }, module: { id: '7', name: 'Лекция 1', type: 'lecture', courseUrl: 'https://sdo.tusur.ru/course/view.php?id=1', activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=7?token=secret' } }, 'Алгебра');
    expect(first.status).toBe('resolved');
    if (first.status !== 'resolved') return;
    const id = first.candidates[0]!.id;
    expect(store.get(id)?.activityName).toBe('Лекция 1');
    expect(JSON.stringify(first)).not.toMatch(/https:|token|secret|courseUrl|activityUrl/);
    expect(id).not.toBe('7');
    expect(store.remember({ status: 'not_found' }, 'Другое')).toEqual({ status: 'not_found' });
    expect(store.get(id)).toBeUndefined();
  });

  it('uses safe course fallback for URL based ambiguous results', () => {
    const store = new ManualTargetStore();
    const result = store.remember({ status: 'ambiguous', candidates: [{ id: '1', name: 'Практика', type: 'practical', courseUrl: 'https://sdo.tusur.ru/course/view.php?id=1', activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=2' }] }, 'https://sdo.tusur.ru/course/view.php?id=1');
    expect(result).toMatchObject({ status: 'ambiguous', candidates: [{ name: 'Практика', courseName: 'Курс СДО' }] });
    expect(JSON.stringify(result)).not.toContain('https:');
  });
});
