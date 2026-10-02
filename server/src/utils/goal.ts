import type { Goal } from '../types';

/**
 * Reads a success metric from untyped input, or returns null when it is not one. A conversion
 * is identified by the event the frontend reports for it; page views need nothing more.
 */
export const toGoal = (value: unknown): Goal | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const { type, event } = value as Record<string, unknown>;

  if (type === 'pageviews') {
    return { type, event: null };
  }

  if (type === 'conversion' && typeof event === 'string' && event.trim() !== '') {
    return { type, event: event.trim() };
  }

  return null;
};
