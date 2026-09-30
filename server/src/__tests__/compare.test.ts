import { describe, expect, it } from 'vitest';

import { buildPopulate, contentKey, uniqueSuffix, type Model } from '../utils/compare';

const components: Record<string, Model> = {
  'shared.seo': {
    attributes: {
      metaTitle: { type: 'string' },
      image: { type: 'media' },
    },
  },
  'blocks.hero': {
    attributes: {
      heading: { type: 'string' },
      seo: { type: 'component', component: 'shared.seo' },
    },
  },
};

const getComponent = (uid: string) => components[uid];

const article: Model = {
  attributes: {
    title: { type: 'string' },
    name: { type: 'string', unique: true },
    slug: { type: 'uid' },
    body: { type: 'text' },
    seo: { type: 'component', component: 'shared.seo' },
    blocks: { type: 'dynamiczone', components: ['blocks.hero'] },
    cover: { type: 'media' },
    related: { type: 'relation', relation: 'oneToMany', target: 'api::article.article' },
    owner: { type: 'relation', relation: 'morphToOne' },
    strapi_stage: { type: 'relation', relation: 'oneToOne', visible: false },
    secret: { type: 'password' },
  },
};

const original = {
  id: 1,
  documentId: 'control',
  locale: 'en',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  publishedAt: null,
  title: 'Pricing',
  name: 'pricing',
  slug: 'pricing',
  body: 'Simple pricing',
  seo: { id: 10, metaTitle: 'Pricing', image: { id: 7 } },
  blocks: [{ __component: 'blocks.hero', id: 20, heading: 'Hi', seo: { id: 11, metaTitle: 'x' } }],
  cover: { id: 3 },
  related: [{ documentId: 'a' }, { documentId: 'b' }],
  strapi_stage: { id: 1 },
};

// What a clone looks like: new ids everywhere, its own uid, suffixed unique text.
const clone = {
  ...original,
  id: 2,
  documentId: 'variant',
  updatedAt: '2026-02-02',
  name: 'pricing [B]',
  slug: 'pricing-ab-b-1f2e',
  seo: { id: 30, metaTitle: 'Pricing', image: { id: 7 } },
  blocks: [{ __component: 'blocks.hero', id: 40, heading: 'Hi', seo: { id: 31, metaTitle: 'x' } }],
  strapi_stage: { id: 2 },
};

const key = (entry: Record<string, unknown>, suffix?: string) =>
  contentKey(entry, article, getComponent, suffix);

describe('contentKey', () => {
  it('treats a fresh clone as identical to the original', () => {
    expect(key(clone, uniqueSuffix('b'))).toBe(key(original));
  });

  it.each([
    ['a text field', { title: 'Better pricing' }],
    ['a unique text field', { name: 'plans [B]' }],
    ['a field inside a component', { seo: { id: 30, metaTitle: 'New', image: { id: 7 } } }],
    ['the media of a component', { seo: { id: 30, metaTitle: 'Pricing', image: { id: 8 } } }],
    [
      'a dynamic zone block',
      { blocks: [{ __component: 'blocks.hero', id: 40, heading: 'Hello', seo: null }] },
    ],
    ['a removed block', { blocks: [] }],
    ['a media field', { cover: { id: 4 } }],
    ['the relations', { related: [{ documentId: 'a' }] }],
    ['the order of relations', { related: [{ documentId: 'b' }, { documentId: 'a' }] }],
  ])('detects a change to %s', (_label, change) => {
    expect(key({ ...clone, ...change }, uniqueSuffix('b'))).not.toBe(key(original));
  });

  it('ignores the uid, which a variant never shares with the original', () => {
    expect(key({ ...clone, slug: 'anything' }, uniqueSuffix('b'))).toBe(key(original));
  });
});

describe('buildPopulate', () => {
  it('loads components, dynamic zones, media and relations, and skips what is not compared', () => {
    expect(buildPopulate(article, getComponent)).toEqual({
      seo: { populate: { image: { fields: ['id'] } } },
      blocks: {
        on: {
          'blocks.hero': { populate: { seo: { populate: { image: { fields: ['id'] } } } } },
        },
      },
      cover: { fields: ['id'] },
      related: { fields: ['documentId'] },
    });
  });
});
