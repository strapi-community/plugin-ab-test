import type { Core, Modules, UID } from '@strapi/strapi';

import { CONTROL_KEY, LABEL_KEY, SEED_PARAM, VARIANT_PARAM } from './constants';
import type { Assignment, ServingExperiment, TypeState } from './types';
import { getService } from './utils';
import { resolveVariantKey } from './utils/assignment';
import { isInternalCall, runInternal } from './utils/internal';

type Entry = Record<string, unknown>;
type Params = Record<string, unknown>;
type Middleware = Modules.Documents.Middleware.Middleware;

/** Where a document call comes from, when the plugin has something to do for it. */
type Scope = 'public' | 'content-manager-list';

interface Pick {
  index: number;
  experiment: ServingExperiment;
  key: string;
  locale: string | undefined;
  variantDocumentId?: string;
}

const READ_ACTIONS = new Set(['findMany', 'findFirst', 'findOne', 'count']);

const CM_LIST_PATH = /^\/content-manager\/collection-types\/[^/]+\/?$/;

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

const isEmptyFilter = (filters: unknown) =>
  filters === undefined ||
  filters === null ||
  (typeof filters === 'object' && Object.keys(filters as object).length === 0);

/**
 * Always nested under $and: findOne sets its own `documentId` condition at the top level of the
 * query, which would silently replace a top-level `documentId` filter.
 */
const withFilter = (filters: unknown, extra: Record<string, unknown>) => ({
  $and: isEmptyFilter(filters) ? [extra] : [filters, extra],
});

export const createDocumentMiddleware = ({ strapi }: { strapi: Core.Strapi }): Middleware => {
  const registry = getService(strapi, 'registry');

  const getScope = (): Scope | null => {
    const request = strapi.requestContext.get();

    // No request means application code (cron, scripts, lifecycles): leave it alone.
    if (!request) {
      return null;
    }

    const type = request.state?.route?.info?.type;

    if (type === 'content-api') {
      return 'public';
    }

    if (type === 'admin') {
      return request.method === 'GET' && CM_LIST_PATH.test(request.path)
        ? 'content-manager-list'
        : null;
    }

    // The GraphQL endpoint is a plain server route, so it carries no content-api type.
    return strapi.plugin('graphql') &&
      request.path === strapi.config.get('plugin::graphql.endpoint', '/graphql')
      ? 'public'
      : null;
  };

  const getDefaultLocale = async (): Promise<string | undefined> =>
    strapi.plugin('i18n')?.service('locales')?.getDefaultLocale();

  /** Replaces tested entries by the variant assigned to this request. */
  const swap = async (
    uid: UID.ContentType,
    typeState: TypeState,
    result: Entry | Entry[],
    params: Params,
    seed: string | undefined,
    forced: string | undefined
  ) => {
    const entries = Array.isArray(result) ? [...result] : [result];
    const now = Date.now();
    const picks: Pick[] = [];
    let defaultLocale: Promise<string | undefined> | undefined;

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const documentId = asString(entry?.documentId);
      const experiment = documentId ? typeState.serving.get(documentId) : undefined;

      if (!experiment) {
        continue;
      }

      let locale: string | undefined;

      if (typeState.localized) {
        locale = asString(entry.locale) ?? asString(params.locale);

        // Only a locale-scoped experiment needs to know which locale the default resolved to.
        if (!locale && experiment.locales) {
          defaultLocale ??= getDefaultLocale();
          locale = await defaultLocale;
        }
      }

      const key = resolveVariantKey(experiment, { seed, forced, locale, now });

      if (key) {
        picks.push({ index, experiment, key, locale });
      }
    }

    if (picks.length === 0) {
      return result;
    }

    // One query per locale present in the result, which is a single query for a normal request.
    const wanted = new Map<string | undefined, string[]>();

    for (const pick of picks) {
      const variant = pick.experiment.variants.find((item) => item.key === pick.key);

      if (variant) {
        pick.variantDocumentId = variant.documentId;
        wanted.set(pick.locale, [...(wanted.get(pick.locale) ?? []), variant.documentId]);
      }
    }

    const fetched = new Map<string, Entry>();

    await Promise.all(
      [...wanted].map(async ([locale, documentIds]) => {
        const variants = (await runInternal(() =>
          strapi.documents(uid).findMany({
            filters: { documentId: { $in: documentIds } },
            status: params.status,
            fields: params.fields,
            populate: params.populate,
            limit: documentIds.length,
            ...(locale ? { locale } : {}),
          } as never)
        )) as Entry[];

        for (const variant of variants) {
          fetched.set(`${locale ?? ''}:${variant.documentId}`, variant);
        }
      })
    );

    for (const pick of picks) {
      const control = entries[pick.index];
      const variant = pick.variantDocumentId
        ? fetched.get(`${pick.locale ?? ''}:${pick.variantDocumentId}`)
        : undefined;

      if (!variant) {
        // Assigned to the control, or the variant is not available in this locale or status.
        const label: Assignment =
          pick.key === CONTROL_KEY
            ? { experiment: pick.experiment.key, variant: CONTROL_KEY }
            : { experiment: pick.experiment.key, variant: CONTROL_KEY, fallback: true };

        entries[pick.index] = { ...control, [LABEL_KEY]: label };
        continue;
      }

      // The consumer asked for the control: keep its identity so links and caches stay stable.
      const served: Entry = { ...variant, id: control.id, documentId: control.documentId };

      for (const field of typeState.uidFields) {
        if (field in control) {
          served[field] = control[field];
        }
      }

      served[LABEL_KEY] = { experiment: pick.experiment.key, variant: pick.key } as Assignment;
      entries[pick.index] = served;
    }

    return Array.isArray(result) ? entries : entries[0];
  };

  return async (ctx, next) => {
    const isRead = READ_ACTIONS.has(ctx.action);

    if (!isRead && ctx.action !== 'delete') {
      return next();
    }

    // Content types without experiments stop here: one Map lookup, no allocation.
    const typeState = registry.snapshot().types.get(ctx.uid);

    if (!typeState || isInternalCall()) {
      return next();
    }

    const params = (ctx.params ?? {}) as Params;

    if (ctx.action === 'delete') {
      const documentId = asString(params.documentId);
      const tracked =
        documentId && (typeState.controls.has(documentId) || typeState.variants.has(documentId));

      const result = await next();

      if (tracked) {
        try {
          await getService(strapi, 'experiments').handleDocumentDeleted(ctx.uid, documentId);
        } catch (error) {
          strapi.log.error(
            `[ab-test] Could not update experiments after deleting ${documentId}: ${(error as Error).message}`
          );
        }
      }

      return result;
    }

    const scope = getScope();

    if (!scope) {
      return next();
    }

    // Variants are versions of another entry, never entries of their own.
    if (ctx.action === 'findOne') {
      // The requested id is known, so answer from memory instead of growing the query.
      if (typeState.variants.has(asString(params.documentId) ?? '')) {
        return null;
      }
    } else if (typeState.variantIds.length > 0) {
      ctx.params = {
        ...params,
        filters: withFilter(params.filters, { documentId: { $notIn: typeState.variantIds } }),
      } as typeof ctx.params;
    }

    const result = await next();

    if (
      scope !== 'public' ||
      ctx.action === 'count' ||
      typeState.serving.size === 0 ||
      result === null ||
      typeof result !== 'object'
    ) {
      return result;
    }

    return swap(
      ctx.uid,
      typeState,
      result as Entry | Entry[],
      params,
      asString(params[SEED_PARAM]),
      asString(params[VARIANT_PARAM])
    ) as ReturnType<Middleware>;
  };
};
