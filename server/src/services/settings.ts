import type { Core, Struct } from '@strapi/strapi';
import { errors } from '@strapi/utils';

import { EXPERIMENT_UID, PLUGIN_ID, STORE_KEY } from '../constants';
import type { Settings } from '../types';
import { hasDraftAndPublish, isEligible, isLocalized } from '../utils';

const DEFAULT_SETTINGS: Settings = { contentTypes: [] };

const settings = ({ strapi }: { strapi: Core.Strapi }) => {
  const store = () => strapi.store({ type: 'plugin', name: PLUGIN_ID });

  const eligibleContentTypes = () =>
    Object.values(strapi.contentTypes as Record<string, Struct.ContentTypeSchema>)
      .filter(isEligible)
      .map((contentType) => ({
        uid: contentType.uid as string,
        displayName: contentType.info.displayName,
        localized: isLocalized(contentType),
        draftAndPublish: hasDraftAndPublish(contentType),
      }));

  const get = async (): Promise<Settings> => {
    const value = (await store().get({ key: STORE_KEY })) as Partial<Settings> | null;
    const eligible = new Set(eligibleContentTypes().map((contentType) => contentType.uid));

    return {
      ...DEFAULT_SETTINGS,
      ...value,
      // Drop types that no longer exist in the application.
      contentTypes: (value?.contentTypes ?? []).filter((uid) => eligible.has(uid)),
    };
  };

  return {
    eligibleContentTypes,
    get,

    async isEnabled(uid: string): Promise<boolean> {
      return (await get()).contentTypes.includes(uid);
    },

    async set(input: Settings): Promise<Settings> {
      const eligible = new Set(eligibleContentTypes().map((contentType) => contentType.uid));
      const contentTypes = [...new Set(input.contentTypes)];

      const unknown = contentTypes.filter((uid) => !eligible.has(uid));
      if (unknown.length > 0) {
        throw new errors.ValidationError(
          `A/B testing is only available on collection types of the application: ${unknown.join(', ')}`
        );
      }

      // Disabling a type would un-hide its variants, so its experiments must go first.
      const current = await get();
      const removed = current.contentTypes.filter((uid) => !contentTypes.includes(uid));

      if (removed.length > 0) {
        const inUse = await strapi.db
          .query(EXPERIMENT_UID)
          .count({ where: { contentType: { $in: removed } } });

        if (inUse > 0) {
          throw new errors.ValidationError(
            'Delete the experiments of a content type before disabling A/B testing on it.'
          );
        }
      }

      const value: Settings = { contentTypes };
      await store().set({ key: STORE_KEY, value });

      return value;
    },

    async clear(): Promise<void> {
      await store().delete({ key: STORE_KEY });
    },
  };
};

export default settings;
