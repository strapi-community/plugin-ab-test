import type { Core } from '@strapi/strapi';

import type { DisposeMode } from '../types';
import { getService } from '../utils';

const uninstall = ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * Leaves the application as if the plugin had never been used: every experiment is removed,
   * its variants are deleted or turned into ordinary drafts, and the plugin settings are cleared.
   * After this the package can be removed without variants surfacing as public entries.
   */
  async prepare(mode: DisposeMode) {
    const experiments = await getService(strapi, 'experiments').findAll();
    let variants = 0;

    for (const experiment of experiments) {
      variants += experiment.variants.length;
      await getService(strapi, 'experiments').remove(experiment.documentId, mode);
    }

    await getService(strapi, 'settings').clear();
    await getService(strapi, 'registry').refresh();

    return { experiments: experiments.length, variants };
  },
});

export default uninstall;
