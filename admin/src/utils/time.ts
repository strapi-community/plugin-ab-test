const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface TimeLeft {
  value: number;
  unit: 'day' | 'hour' | 'minute';
}

/**
 * How long until a date, in the largest unit that fits, rounded down so the figure never
 * promises more time than there is. Returns null once the date has passed.
 */
export const timeLeft = (end: string, now: number = Date.now()): TimeLeft | null => {
  const remaining = Date.parse(end) - now;

  if (Number.isNaN(remaining) || remaining <= 0) {
    return null;
  }

  if (remaining >= DAY) {
    return { value: Math.floor(remaining / DAY), unit: 'day' };
  }

  if (remaining >= HOUR) {
    return { value: Math.floor(remaining / HOUR), unit: 'hour' };
  }

  // Under a minute still reads as "1 minute" rather than zero.
  return { value: Math.max(1, Math.floor(remaining / MINUTE)), unit: 'minute' };
};
