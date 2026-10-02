import type { Core } from '@strapi/strapi';

import { PLUGIN_ID } from './constants';
import { createDocumentMiddleware } from './document-middleware';
import { getService } from './utils';
import { setUnsubscribe } from './destroy';

const bootstrap = async ({ strapi }: { strapi: Core.Strapi }) => {
  await strapi.service('admin::permission').actionProvider.registerMany([
    {
      section: 'plugins',
      displayName: 'Read experiments',
      uid: 'read',
      pluginName: PLUGIN_ID,
    },
    {
      section: 'plugins',
      displayName: 'Create and manage experiments',
      uid: 'manage',
      pluginName: PLUGIN_ID,
    },
    {
      section: 'settings',
      category: 'A/B Testing',
      displayName: 'Change settings',
      uid: 'settings',
      pluginName: PLUGIN_ID,
    },
  ]);

  // Load experiments before the first request so the middleware never waits on the database.
  await getService(strapi, 'registry').refresh();

  setUnsubscribe(strapi.documents.use(createDocumentMiddleware({ strapi })));

  await getService(strapi, 'metrics').sendDidInitializeEvent();
};

export default bootstrap;
