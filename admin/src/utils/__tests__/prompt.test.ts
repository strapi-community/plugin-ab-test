import { describe, expect, it } from 'vitest';

import { buildFrontendPrompt, type PromptInput } from '../prompt';

const article = {
  uid: 'api::article.article',
  displayName: 'Article',
  singularName: 'article',
  pluralName: 'articles',
};
const page = {
  uid: 'api::page.page',
  displayName: 'Landing page',
  singularName: 'page',
  pluralName: 'pages',
};

const experiment = (overrides: Partial<PromptInput['experiments'][number]>) => ({
  name: 'Pricing headline',
  key: 'article-3f9a1c',
  contentType: article.uid,
  status: 'running' as const,
  goal: null,
  ...overrides,
});

const build = (overrides: Partial<PromptInput> = {}) =>
  buildFrontendPrompt({ contentTypes: [article], experiments: [], posthog: null, ...overrides });

describe('buildFrontendPrompt', () => {
  it('lists the routes and queries of the content types under test', () => {
    const prompt = build({ contentTypes: [article, page] });

    expect(prompt).toContain(
      '- Article: REST `/api/articles`, GraphQL queries `article` and `articles`'
    );
    expect(prompt).toContain(
      '- Landing page: REST `/api/pages`, GraphQL queries `page` and `pages`'
    );
  });

  it('names the success metrics of the experiments that are not over', () => {
    const prompt = build({
      contentTypes: [article, page],
      experiments: [
        experiment({ goal: { type: 'conversion', event: 'form_submitted' } }),
        experiment({
          name: 'Home layout',
          key: 'page-77aa01',
          contentType: page.uid,
          status: 'paused',
          goal: { type: 'pageviews', event: null },
        }),
        experiment({
          name: 'Old test',
          status: 'completed',
          goal: { type: 'conversion', event: 'legacy_signup' },
        }),
        experiment({ name: 'No metric' }),
      ],
    });

    expect(prompt).toContain(
      '- Experiment "Pricing headline" (key `article-3f9a1c`, on Article): a conversion, counted when the event `form_submitted` is sent'
    );
    expect(prompt).toContain(
      '- Experiment "Home layout" (key `page-77aa01`, on Landing page): page views'
    );
    expect(prompt).not.toContain('legacy_signup');
    expect(prompt).not.toContain('No metric');
  });

  it('asks for candidate events when no experiment has a success metric', () => {
    const prompt = build({ experiments: [experiment({ name: 'Untitled', status: 'draft' })] });

    expect(prompt).toContain('No experiment has a success metric yet.');
    expect(prompt).not.toContain('These are the success metrics');
  });

  it('makes the event names binding only when PostHog is connected, and says which project', () => {
    const connected = build({ posthog: { host: 'https://eu.posthog.com', projectId: '4321' } });
    const free = build();

    expect(connected).toContain('report any difference as wrong');
    expect(connected).toContain('project `4321` on `https://eu.posthog.com`');
    expect(connected).toContain('`$pageview`');

    expect(free).toContain('Event names are therefore free');
    expect(free).not.toContain('report any difference as wrong');

    // The convention itself is the same either way.
    for (const prompt of [connected, free]) {
      expect(prompt).toContain('the exposure event is named `ab_test_exposure`');
    }
  });

  it('shows the example on a content type of the project', () => {
    const prompt = build({ contentTypes: [page, article] });

    expect(prompt).toContain('/api/pages?filters[slug][$eq]=${slug}&abSeed=');
    expect(prompt).toContain("experiment: 'page-3f9a1c'");
  });

  it('covers both jobs, waits before editing, and leaves no placeholder to fill in', () => {
    const prompt = build();

    expect(prompt).toContain('## Part 1: send the seed');
    expect(prompt).toContain('## Part 2: audit the analytics');
    expect(prompt).toContain('do not edit anything before I reply');
    expect(prompt).toContain('abTest.fallback');
    expect(prompt).not.toMatch(/undefined|\[object Object\]|TODO|<[A-Z_]+>/);
  });
});
