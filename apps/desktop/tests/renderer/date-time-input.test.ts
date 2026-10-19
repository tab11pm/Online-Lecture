import { describe, expect, it } from 'vitest';
import {
  isValidClockTime,
  toDisplayDate,
  toIsoDate,
} from '../../src/renderer/src/date-time-input.js';

describe('deterministic Russian date and time input', () => {
  it('converts valid dates between display and IPC formats', () => {
    expect(toDisplayDate('2028-02-29')).toBe('29.02.2028');
    expect(toIsoDate('29.02.2028')).toBe('2028-02-29');
  });

  it.each(['31.02.2028', '29.02.2027', '1.02.2028', '00.12.2028'])(
    'rejects impossible or malformed date %s',
    (date) => expect(toIsoDate(date)).toBeUndefined(),
  );

  it('accepts only real 24-hour clock values', () => {
    expect(isValidClockTime('00:00')).toBe(true);
    expect(isValidClockTime('23:59')).toBe(true);
    expect(isValidClockTime('25:00')).toBe(false);
    expect(isValidClockTime('12:60')).toBe(false);
    expect(isValidClockTime('1:05')).toBe(false);
  });
});
