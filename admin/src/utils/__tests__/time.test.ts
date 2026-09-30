import { describe, expect, it } from 'vitest';

import { timeLeft } from '../time';

const now = Date.parse('2026-06-15T12:00:00Z');

describe('timeLeft', () => {
  it.each([
    ['2026-06-18T18:00:00Z', { value: 3, unit: 'day' }],
    ['2026-06-16T12:00:00Z', { value: 1, unit: 'day' }],
    ['2026-06-16T11:59:00Z', { value: 23, unit: 'hour' }],
    ['2026-06-15T13:00:00Z', { value: 1, unit: 'hour' }],
    ['2026-06-15T12:45:30Z', { value: 45, unit: 'minute' }],
    ['2026-06-15T12:00:20Z', { value: 1, unit: 'minute' }],
  ])('until %s', (end, expected) => {
    expect(timeLeft(end, now)).toEqual(expected);
  });

  it('returns nothing once the date has passed, or for an invalid date', () => {
    expect(timeLeft('2026-06-15T12:00:00Z', now)).toBeNull();
    expect(timeLeft('2026-06-01T00:00:00Z', now)).toBeNull();
    expect(timeLeft('not a date', now)).toBeNull();
  });
});
