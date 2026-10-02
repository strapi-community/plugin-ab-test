import type { Core } from '@strapi/strapi';

import type { Results } from '../types';
import { getService } from '../utils';
import { buildResultsQuery, toVersionResults } from '../utils/posthog';

/** How long an answer from PostHog is reused, so opening an experiment twice costs one query. */
const REUSE_MS = 60_000;

/**
 * Reads the results of an experiment from PostHog, for the admin panel. Optional: without a
 * PostHog connection, experiments run the same and results are read wherever the frontend
 * reports to. Never called on the Content API path.
 */
const results = ({ strapi }: { strapi: Core.Strapi }) => {
  const cache = new Map<string, { at: number; data: Results }>();

  return {
    async get(documentId: string, options: { refresh?: boolean } = {}): Promise<Results> {
      const experiment = await getService(strapi, 'experiments').findOne(documentId);
      const config = await getService(strapi, 'posthog').resolve();
      const { goal } = experiment;

      const empty: Results = {
        connected: config !== null,
        goal,
        versions: [],
        fetchedAt: null,
        error: null,
      };

      // Nothing was served before the first start, so there is nothing to read yet.
      if (!config || !goal || experiment.status === 'draft') {
        return empty;
      }

      // The project is part of the key: results of another one must not outlive a reconnection.
      const key = [config.host, config.projectId, documentId, goal.type, goal.event ?? ''].join(
        '|'
      );
      const known = cache.get(key);

      if (known && !options.refresh && Date.now() - known.at < REUSE_MS) {
        return known.data;
      }

      try {
        const rows = await getService(strapi, 'posthog').query(
          config,
          buildResultsQuery(experiment, goal)
        );
        const data: Results = {
          ...empty,
          versions: toVersionResults(experiment, goal, rows),
          fetchedAt: new Date().toISOString(),
        };

        cache.set(key, { at: Date.now(), data });

        return data;
      } catch (error) {
        return { ...empty, error: (error as Error).message };
      }
    },
  };
};

export default results;
