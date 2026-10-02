import { describe, expect, it } from 'vitest';

import { toGoal } from '../utils/goal';

describe('toGoal', () => {
  it('reads a conversion with its event', () => {
    expect(toGoal({ type: 'conversion', event: 'form_submitted' })).toEqual({
      type: 'conversion',
      event: 'form_submitted',
    });
  });

  it('trims the event name', () => {
    expect(toGoal({ type: 'conversion', event: '  form_submitted ' })?.event).toBe(
      'form_submitted'
    );
  });

  it('refuses a conversion without an event', () => {
    expect(toGoal({ type: 'conversion' })).toBeNull();
    expect(toGoal({ type: 'conversion', event: '   ' })).toBeNull();
    expect(toGoal({ type: 'conversion', event: 42 })).toBeNull();
  });

  it('reads page views and drops an event sent with them', () => {
    expect(toGoal({ type: 'pageviews' })).toEqual({ type: 'pageviews', event: null });
    expect(toGoal({ type: 'pageviews', event: 'form_submitted' })).toEqual({
      type: 'pageviews',
      event: null,
    });
  });

  it('returns null for anything else', () => {
    expect(toGoal(null)).toBeNull();
    expect(toGoal(undefined)).toBeNull();
    expect(toGoal('conversion')).toBeNull();
    expect(toGoal({ type: 'revenue' })).toBeNull();
    expect(toGoal([])).toBeNull();
  });
});
