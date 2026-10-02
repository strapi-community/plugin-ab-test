import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Experiment, Goal } from '../types';
import { buildResultsQuery, describeFailure, toVersionResults } from '../utils/posthog';

import { answer, mockStrapi } from './posthog-mock';

const conversion: Goal = { type: 'conversion', event: 'form_submitted' };
const pageviews: Goal = { type: 'pageviews', event: null };

const experiment = (overrides: Partial<Experiment> = {}): Experiment => ({
  id: 1,
  documentId: 'experiment-1',
  key: 'article-a1b2c3',
  name: 'Homepage headline',
  hypothesis: null,
  goal: conversion,
  contentType: 'api::article.article',
  controlDocumentId: 'control',
  variants: [
    { key: 'b', documentId: 'variant-b', weight: 25 },
    { key: 'c', documentId: 'variant-c', weight: 25 },
  ],
  status: 'running',
  startAt: null,
  endAt: null,
  locales: null,
  winner: null,
  createdAt: '2026-03-10T08:30:00.000Z',
  ...overrides,
});

const file = { host: 'https://eu.posthog.com/', projectId: 4321, personalApiKey: 'phx_secret' };

const setup = (options: { config?: unknown; tested?: Experiment } = {}) =>
  mockStrapi({
    config: 'config' in options ? options.config : file,
    experiment: options.tested ?? experiment(),
  }).results;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildResultsQuery', () => {
  it('passes every name as a value, never inside the query', () => {
    const { query, values } = buildResultsQuery(experiment(), {
      type: 'conversion',
      event: "it's'); DROP",
    });

    expect(query).not.toContain('DROP');
    expect(query).not.toContain('article-a1b2c3');
    expect(values).toEqual({
      exposure: 'ab_test_exposure',
      experiment: 'article-a1b2c3',
      goal: "it's'); DROP",
      // A day before the creation, whatever the timezone of the PostHog project.
      since: '2026-03-09 08:30:00',
    });
  });

  it('counts page views on the PostHog page view event', () => {
    const { query, values } = buildResultsQuery(experiment(), pageviews);

    expect(values.goal).toBe('$pageview');
    expect(query).toContain('arrayCount');
  });
});

describe('toVersionResults', () => {
  it('lists every version, original first, with zeros for the ones PostHog has not seen', () => {
    const versions = toVersionResults(experiment(), conversion, [
      ['b', 1000, 130, 0.11],
      ['control', 1000, 100, 0.09],
      ['removed-variant', 50, 5, 0.09],
    ]);

    expect(versions.map((version) => version.key)).toEqual(['control', 'b', 'c']);
    expect(versions[0]).toEqual({
      key: 'control',
      visitors: 1000,
      count: 100,
      value: 0.1,
      uplift: null,
      significance: null,
    });
    expect(versions[1].value).toBeCloseTo(0.13, 10);
    expect(versions[1].uplift).toBeCloseTo(0.3, 10);
    expect(versions[1].significance).toBeCloseTo(0.9645, 3);
    expect(versions[2]).toEqual({
      key: 'c',
      visitors: 0,
      count: 0,
      value: null,
      uplift: null,
      significance: null,
    });
  });

  it('compares page views per visitor', () => {
    const versions = toVersionResults(experiment(), pageviews, [
      ['control', 400, 800, 4],
      ['b', 400, 920, 5],
    ]);

    expect(versions[1].value).toBeCloseTo(2.3, 10);
    expect(versions[1].uplift).toBeCloseTo(0.15, 10);
    expect(versions[1].significance).toBeCloseTo(0.9545, 3);
  });

  it('survives the values PostHog sends for a single visitor', () => {
    const versions = toVersionResults(experiment(), pageviews, [
      ['control', 1, 3, null],
      ['b', '2', '4', 'nan'],
    ]);

    expect(versions[0].value).toBe(3);
    expect(versions[1]).toMatchObject({ visitors: 2, count: 4, value: 2, significance: null });
  });
});

describe('describeFailure', () => {
  const config = { host: 'https://us.posthog.com', projectId: '99' };

  it('says which kind of key is needed', () => {
    expect(describeFailure(401, '', config)).toMatch(/personal API key \(phx_…\)/);
    expect(describeFailure(403, '', config)).toMatch(/Query Read/);
  });

  it('points at the project and the region', () => {
    expect(describeFailure(404, '', config)).toMatch(/project 99 was not found on https:\/\/us/);
  });

  it('passes on what PostHog said otherwise', () => {
    expect(describeFailure(500, 'Query timed out', config)).toBe(
      'PostHog answered 500: Query timed out'
    );
  });
});

describe('results service', () => {
  it('is not connected without a project id and a key, and asks PostHog nothing', async () => {
    const fetch = answer({ results: [] });
    vi.stubGlobal('fetch', fetch);

    for (const config of [undefined, null, {}, { projectId: '1' }, { personalApiKey: 'phx' }]) {
      expect(await setup({ config }).get('experiment-1')).toEqual({
        connected: false,
        goal: conversion,
        versions: [],
        fetchedAt: null,
        error: null,
      });
    }

    expect(fetch).not.toHaveBeenCalled();
  });

  it('asks nothing before the experiment starts, or without a success metric', async () => {
    const fetch = answer({ results: [] });
    vi.stubGlobal('fetch', fetch);

    const draft = await setup({ tested: experiment({ status: 'draft' }) }).get('experiment-1');
    const noGoal = await setup({ tested: experiment({ goal: null }) }).get('experiment-1');

    expect(draft).toMatchObject({ connected: true, versions: [], error: null });
    expect(noGoal).toMatchObject({ connected: true, goal: null, versions: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('queries the project with the key and returns one result per version', async () => {
    const fetch = answer({
      results: [
        ['control', 1000, 100, 0.09],
        ['b', 1000, 130, 0.11],
      ],
    });
    vi.stubGlobal('fetch', fetch);

    const data = await setup().get('experiment-1');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(url).toBe('https://eu.posthog.com/api/projects/4321/query/');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer phx_secret');
    expect(body.query.kind).toBe('HogQLQuery');
    expect(body.query.values.experiment).toBe('article-a1b2c3');
    expect(body.query.values.goal).toBe('form_submitted');

    expect(data.error).toBeNull();
    expect(data.fetchedAt).not.toBeNull();
    expect(data.versions.map((version) => version.visitors)).toEqual([1000, 1000, 0]);
  });

  it('reuses an answer until asked to refresh', async () => {
    const fetch = answer({ results: [] });
    vi.stubGlobal('fetch', fetch);

    const service = setup();

    await service.get('experiment-1');
    await service.get('experiment-1');
    expect(fetch).toHaveBeenCalledTimes(1);

    await service.get('experiment-1', { refresh: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('reports a refused key as an error to act on, and does not keep it', async () => {
    const fetch = answer({ detail: 'Invalid personal API key.' }, 401);
    vi.stubGlobal('fetch', fetch);

    const service = setup();
    const data = await service.get('experiment-1');

    expect(data.versions).toEqual([]);
    expect(data.error).toMatch(/personal API key/);

    await service.get('experiment-1');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('reports an unreachable PostHog', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      })
    );

    expect((await setup().get('experiment-1')).error).toBe(
      'PostHog could not be reached at https://eu.posthog.com.'
    );
  });
});
