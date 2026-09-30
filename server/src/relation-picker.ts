import type { Core, UID } from '@strapi/strapi';
import type { Context, Next } from 'koa';

import { getService } from './utils';

const AVAILABLE_RELATIONS_PATH = /^\/content-manager\/relations\/([^/]+)\/([^/]+)\/?$/;

/**
 * The Content Manager lists relation candidates with its own database query, which the document
 * middleware never sees. Drop variants from that list so an editor cannot link to one by mistake.
 * Mounted on the relations path only, so no other request pays for it.
 */
export const createRelationPickerMiddleware =
  ({ strapi }: { strapi: Core.Strapi }) =>
  async (ctx: Context, next: Next) => {
    await next();

    const body = ctx.body as { results?: Array<{ documentId?: string }> } | undefined;

    if (ctx.method !== 'GET' || !Array.isArray(body?.results)) {
      return;
    }

    const match = AVAILABLE_RELATIONS_PATH.exec(ctx.path);

    if (!match) {
      return;
    }

    const model = strapi.getModel(decodeURIComponent(match[1]) as UID.Schema);
    const attribute = model?.attributes?.[decodeURIComponent(match[2])];
    const target =
      attribute?.type === 'relation' && 'target' in attribute ? attribute.target : null;
    const typeState = target ? getService(strapi, 'registry').snapshot().types.get(target) : null;

    if (!typeState || typeState.variants.size === 0) {
      return;
    }

    ctx.body = {
      ...body,
      results: body.results.filter(
        (entry) => !entry.documentId || !typeState.variants.has(entry.documentId)
      ),
    };
  };
