import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import type { Context } from 'koa';

import { getService } from '../utils';

const settings = ({ strapi }: { strapi: Core.Strapi }) => {
  const service = () => getService(strapi, 'settings');

  return {
    async get(ctx: Context) {
      ctx.body = {
        data: await service().get(),
        contentTypes: service().eligibleContentTypes(),
      };
    },

    /** Lets the admin panel know where to show A/B testing UI, without a request per page. */
    async contentTypes(ctx: Context) {
      const enabled = new Set((await service().get()).contentTypes);

      ctx.body = {
        data: service()
          .eligibleContentTypes()
          .map((contentType) => ({ ...contentType, enabled: enabled.has(contentType.uid) })),
      };
    },

    async update(ctx: Context) {
      const { contentTypes } = ctx.request.body ?? {};

      if (!Array.isArray(contentTypes) || contentTypes.some((uid) => typeof uid !== 'string')) {
        throw new errors.ValidationError('contentTypes must be a list of content type uids.');
      }

      const updated = await service().set({ contentTypes });

      getService(strapi, 'metrics').sendDidUpdateSettings(updated.contentTypes.length);
      ctx.body = { data: updated };
    },

    /** Removes everything the plugin created so the package can be uninstalled cleanly. */
    async prepareUninstall(ctx: Context) {
      const mode = ctx.request.body?.variants === 'keep' ? 'keep' : 'delete';

      const removed = await getService(strapi, 'uninstall').prepare(mode);

      getService(strapi, 'metrics').sendDidPrepareUninstall(mode, removed);
      ctx.body = { data: removed };
    },
  };
};

export default settings;
