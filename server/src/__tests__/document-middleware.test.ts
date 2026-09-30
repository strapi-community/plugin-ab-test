import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDocumentMiddleware } from '../document-middleware';
import type { RegistryState, TypeState } from '../types';

const ARTICLE = 'api::article.article';

const typeState = (overrides: Partial<TypeState> = {}): TypeState => ({
  variantIds: ['variant-b'],
  variants: new Set(['variant-b']),
  controls: new Set(['control']),
  serving: new Map([
    [
      'control',
      {
        key: 'article-1',
        status: 'running',
        variants: [{ key: 'b', documentId: 'variant-b', weight: 100 }],
        winner: null,
        startMs: null,
        endMs: null,
        locales: null,
      },
    ],
  ]),
  uidFields: ['slug'],
  localized: true,
  ...overrides,
});

const setup = (options: { state?: RegistryState; route?: string | null; path?: string } = {}) => {
  const state = options.state ?? { types: new Map([[ARTICLE, typeState()]]) };
  const findMany = vi.fn(async () => [
    { id: 20, documentId: 'variant-b', locale: 'en', title: 'B title', slug: 'post-ab-b' },
  ]);
  const handleDocumentDeleted = vi.fn(async () => {});
  const requestContext = vi.fn(() =>
    options.route === null
      ? undefined
      : {
          method: 'GET',
          path: options.path ?? '/api/articles',
          state: { route: { info: { type: options.route ?? 'content-api' } } },
        }
  );

  const strapi = {
    plugin: (name: string) =>
      name === 'ab-test'
        ? {
            service: (service: string) =>
              service === 'registry' ? { snapshot: () => state } : { handleDocumentDeleted },
          }
        : undefined,
    requestContext: { get: requestContext },
    documents: vi.fn(() => ({ findMany })),
    config: { get: () => '/graphql' },
    log: { error: vi.fn() },
  };

  const middleware = createDocumentMiddleware({ strapi: strapi as never });

  const run = (action: string, params: Record<string, unknown>, result: unknown, uid = ARTICLE) => {
    const ctx = { uid, action, params, contentType: {} };
    const next = vi.fn(async () => result);

    return middleware(ctx as never, next as never).then((output) => ({ output, ctx, next }));
  };

  return { run, findMany, requestContext, handleDocumentDeleted };
};

const control = { id: 10, documentId: 'control', locale: 'en', title: 'A title', slug: 'post' };

describe('document middleware', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does nothing for content types without experiments', async () => {
    const { run, requestContext, findMany } = setup();
    const params = { abSeed: 'x' };

    const { output, ctx } = await run('findMany', params, [control], 'api::page.page');

    expect(output).toEqual([control]);
    expect(ctx.params).toBe(params);
    expect(requestContext).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it.each(['create', 'update', 'publish', 'unpublish', 'discardDraft', 'clone'])(
    'does nothing on %s',
    async (action) => {
      const { run, requestContext } = setup();
      const params = { documentId: 'control', data: {} };

      const { ctx } = await run(action, params, control);

      expect(ctx.params).toBe(params);
      expect(requestContext).not.toHaveBeenCalled();
    }
  );

  it('does nothing for calls made outside a request', async () => {
    const { run, findMany } = setup({ route: null });
    const params = { abSeed: 'x' };

    const { output, ctx } = await run('findMany', params, [control]);

    expect(output).toEqual([control]);
    expect(ctx.params).toBe(params);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('hides variants from public reads and keeps existing filters', async () => {
    const { run } = setup();

    const { ctx } = await run('findMany', { filters: { title: 'A title' } }, []);

    expect(ctx.params.filters).toEqual({
      $and: [{ title: 'A title' }, { documentId: { $notIn: ['variant-b'] } }],
    });
  });

  it('answers a direct request for a variant from memory, without a query', async () => {
    const { run } = setup();

    const { output, next } = await run('findOne', { documentId: 'variant-b' }, control);

    expect(output).toBeNull();
    expect(next).not.toHaveBeenCalled();
  });

  it('leaves single-entry reads of other documents unfiltered', async () => {
    const { run } = setup();
    const params = { documentId: 'control' };

    const { ctx } = await run('findOne', params, control);

    expect(ctx.params).toBe(params);
  });

  it('hides variants from counts so pagination totals match', async () => {
    const { run, findMany } = setup();

    const { ctx, output } = await run('count', { abSeed: 'x' }, 3);

    expect(ctx.params.filters).toEqual({ $and: [{ documentId: { $notIn: ['variant-b'] } }] });
    expect(output).toBe(3);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('serves the control and runs no extra query without a seed', async () => {
    const { run, findMany } = setup();

    const { output } = await run('findMany', {}, [control]);

    expect(output).toEqual([control]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('swaps in the assigned variant with a single query, keeping the control identity', async () => {
    const { run, findMany } = setup();
    const other = { id: 11, documentId: 'other', locale: 'en', title: 'Other', slug: 'other' };

    const { output } = await run(
      'findMany',
      { abSeed: 'visitor', status: 'published', fields: ['title', 'slug'], populate: '*' },
      [control, other]
    );

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      filters: { documentId: { $in: ['variant-b'] } },
      status: 'published',
      fields: ['title', 'slug'],
      populate: '*',
      limit: 1,
      locale: 'en',
    });
    expect(output).toEqual([
      {
        id: 10,
        documentId: 'control',
        locale: 'en',
        title: 'B title',
        slug: 'post',
        abTest: { experiment: 'article-1', variant: 'b' },
      },
      other,
    ]);
  });

  it('swaps a single entry returned by findOne', async () => {
    const { run } = setup();

    const { output } = await run('findOne', { documentId: 'control', abVariant: 'b' }, control);

    expect(output).toMatchObject({ documentId: 'control', title: 'B title', slug: 'post' });
  });

  it('falls back to the control when the variant is not available', async () => {
    const { run, findMany } = setup();
    findMany.mockResolvedValueOnce([]);

    const { output } = await run('findOne', { documentId: 'control', abSeed: 'x' }, control);

    expect(output).toEqual({
      ...control,
      abTest: { experiment: 'article-1', variant: 'control', fallback: true },
    });
  });

  it('hides variants in the Content Manager list but never swaps there', async () => {
    const { run, findMany } = setup({
      route: 'admin',
      path: '/content-manager/collection-types/api::article.article',
    });

    const { ctx, output } = await run('findMany', { abSeed: 'x' }, [control]);

    expect(ctx.params.filters).toEqual({ $and: [{ documentId: { $notIn: ['variant-b'] } }] });
    expect(output).toEqual([control]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('leaves other admin requests alone so a variant can be opened and edited', async () => {
    const { run } = setup({
      route: 'admin',
      path: '/content-manager/collection-types/api::article.article/variant-b',
    });
    const params = { documentId: 'variant-b' };

    const { ctx } = await run('findOne', params, control);

    expect(ctx.params).toBe(params);
  });

  it('cleans up experiments when a tested entry is deleted', async () => {
    const { run, handleDocumentDeleted } = setup();

    await run('delete', { documentId: 'control' }, { documentId: 'control', entries: [] });
    expect(handleDocumentDeleted).toHaveBeenCalledWith(ARTICLE, 'control');

    handleDocumentDeleted.mockClear();
    await run('delete', { documentId: 'unrelated' }, { documentId: 'unrelated', entries: [] });
    expect(handleDocumentDeleted).not.toHaveBeenCalled();
  });
});
