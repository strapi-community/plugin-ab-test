import type { Core } from '@strapi/strapi';

import { SEED_PARAM, VARIANT_PARAM } from './constants';
import { registerGraphql } from './graphql';
import { createRelationPickerMiddleware } from './relation-picker';

const register = ({ strapi }: { strapi: Core.Strapi }) => {
  strapi.server.router.use(
    '/content-manager/relations/:model/:targetField',
    createRelationPickerMiddleware({ strapi })
  );

  // Older Strapi versions reject unknown query params and have no way to declare new ones.
  if (typeof strapi.contentAPI?.addQueryParams !== 'function') {
    strapi.log.warn(
      `[ab-test] This Strapi version cannot register the "${SEED_PARAM}" query param; variants will not be served.`
    );
    return;
  }

  const onReads = (route: { method: string }) => route.method === 'GET';

  strapi.contentAPI.addQueryParams({
    [SEED_PARAM]: {
      schema: (z) => z.string().max(128).optional(),
      matchRoute: onReads,
    },
    [VARIANT_PARAM]: {
      schema: (z) => z.string().max(32).optional(),
      matchRoute: onReads,
    },
  });

  registerGraphql({ strapi });
};

export default register;
