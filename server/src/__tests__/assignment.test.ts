import { describe, expect, it } from 'vitest';

import { CONTROL_KEY } from '../constants';
import type { ServingExperiment } from '../types';
import { bucket, pickVariant, resolveVariantKey } from '../utils/assignment';

const experiment = (overrides: Partial<ServingExperiment> = {}): ServingExperiment => ({
  key: 'article-1',
  status: 'running',
  variants: [{ key: 'b', documentId: 'doc-b', weight: 50 }],
  winner: null,
  startMs: null,
  endMs: null,
  locales: null,
  ...overrides,
});

const seeds = Array.from({ length: 10000 }, (_, index) => `visitor-${index}`);

describe('bucket', () => {
  it('always maps a seed to the same point in [0, 1)', () => {
    for (const seed of seeds.slice(0, 200)) {
      const point = bucket('article-1', seed);

      expect(point).toBeGreaterThanOrEqual(0);
      expect(point).toBeLessThan(1);
      expect(bucket('article-1', seed)).toBe(point);
    }
  });
});

describe('pickVariant', () => {
  it('splits traffic according to the weights', () => {
    const subject = experiment({
      variants: [
        { key: 'b', documentId: 'doc-b', weight: 30 },
        { key: 'c', documentId: 'doc-c', weight: 20 },
      ],
    });

    const counts: Record<string, number> = { b: 0, c: 0, [CONTROL_KEY]: 0 };
    for (const seed of seeds) {
      counts[pickVariant(subject, seed)] += 1;
    }

    // 10k samples: two points of tolerance is far outside random noise.
    expect(counts.b / seeds.length).toBeCloseTo(0.3, 1);
    expect(counts.c / seeds.length).toBeCloseTo(0.2, 1);
    expect(counts[CONTROL_KEY] / seeds.length).toBeCloseTo(0.5, 1);
    expect(Math.abs(counts.b / seeds.length - 0.3)).toBeLessThan(0.02);
    expect(Math.abs(counts.c / seeds.length - 0.2)).toBeLessThan(0.02);
  });

  it('never serves a variant with no share, and always serves one with a full share', () => {
    const none = experiment({ variants: [{ key: 'b', documentId: 'doc-b', weight: 0 }] });
    const all = experiment({ variants: [{ key: 'b', documentId: 'doc-b', weight: 100 }] });

    for (const seed of seeds.slice(0, 1000)) {
      expect(pickVariant(none, seed)).toBe(CONTROL_KEY);
      expect(pickVariant(all, seed)).toBe('b');
    }
  });

  it('assigns independently across experiments', () => {
    const first = experiment({ key: 'article-1' });
    const second = experiment({ key: 'article-2' });

    const both = seeds.filter(
      (seed) => pickVariant(first, seed) === 'b' && pickVariant(second, seed) === 'b'
    ).length;

    // Two independent 50% splits overlap on about a quarter of visitors, not half.
    expect(Math.abs(both / seeds.length - 0.25)).toBeLessThan(0.02);
  });
});

describe('resolveVariantKey', () => {
  const now = Date.parse('2026-06-15T12:00:00Z');

  it('returns nothing without a seed', () => {
    expect(resolveVariantKey(experiment(), { now })).toBeNull();
  });

  it('assigns with a seed while running', () => {
    expect(['b', CONTROL_KEY]).toContain(resolveVariantKey(experiment(), { seed: 'x', now }));
  });

  it.each(['draft', 'paused'] as const)('does not apply while %s', (status) => {
    expect(resolveVariantKey(experiment({ status }), { seed: 'x', forced: 'b', now })).toBeNull();
  });

  it('respects the schedule', () => {
    const notStarted = experiment({ startMs: now + 1000 });
    const ended = experiment({ endMs: now });
    const active = experiment({ startMs: now - 1000, endMs: now + 1000 });

    expect(resolveVariantKey(notStarted, { forced: 'b', now })).toBeNull();
    expect(resolveVariantKey(ended, { forced: 'b', now })).toBeNull();
    expect(resolveVariantKey(active, { forced: 'b', now })).toBe('b');
  });

  it('respects the locale scope', () => {
    const scoped = experiment({ locales: new Set(['en']) });

    expect(resolveVariantKey(scoped, { forced: 'b', locale: 'en', now })).toBe('b');
    expect(resolveVariantKey(scoped, { forced: 'b', locale: 'fr', now })).toBeNull();
    expect(resolveVariantKey(scoped, { forced: 'b', now })).toBeNull();
  });

  it('lets a request force a known variant, and ignores an unknown one', () => {
    expect(resolveVariantKey(experiment(), { forced: 'b', now })).toBe('b');
    expect(resolveVariantKey(experiment(), { forced: CONTROL_KEY, now })).toBe(CONTROL_KEY);
    expect(resolveVariantKey(experiment(), { forced: 'zzz', now })).toBeNull();
  });

  it('serves the winner of a completed experiment to everyone', () => {
    const won = experiment({ status: 'completed', winner: 'b' });
    const controlWon = experiment({ status: 'completed', winner: CONTROL_KEY });

    expect(resolveVariantKey(won, { now })).toBe('b');
    expect(resolveVariantKey(controlWon, { seed: 'x', now })).toBeNull();
  });
});
