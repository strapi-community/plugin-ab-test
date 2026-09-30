import type { Core } from '@strapi/strapi';

import { CONTROL_KEY, EXPERIMENT_UID, PLUGIN_ID } from '../constants';
import type { Experiment, RegistryState, ServingExperiment, TypeState } from '../types';
import { getContentType, isLocalized, normalizeExperiment } from '../utils';

const isServing = (experiment: Experiment): boolean => {
  if (experiment.variants.length === 0) {
    return false;
  }

  if (experiment.status === 'running') {
    return true;
  }

  return (
    experiment.status === 'completed' &&
    experiment.winner !== null &&
    experiment.winner !== CONTROL_KEY &&
    experiment.variants.some((variant) => variant.key === experiment.winner)
  );
};

const toServing = (experiment: Experiment, localized: boolean): ServingExperiment => ({
  key: experiment.key,
  status: experiment.status,
  variants: experiment.variants,
  winner: experiment.winner,
  startMs: experiment.startAt ? Date.parse(experiment.startAt) : null,
  endMs: experiment.endAt ? Date.parse(experiment.endAt) : null,
  // A locale scope is meaningless on a type that has no locales.
  locales: localized && experiment.locales ? new Set(experiment.locales) : null,
});

export const buildState = (strapi: Core.Strapi, experiments: Experiment[]): RegistryState => {
  const types = new Map<string, TypeState>();

  for (const experiment of experiments) {
    const contentType = getContentType(strapi, experiment.contentType);

    // The content type was removed from the application.
    if (!contentType) {
      continue;
    }

    let typeState = types.get(experiment.contentType);

    if (!typeState) {
      typeState = {
        variantIds: [],
        variants: new Set(),
        controls: new Set(),
        serving: new Map(),
        uidFields: Object.keys(contentType.attributes).filter(
          (name) => contentType.attributes[name].type === 'uid'
        ),
        localized: isLocalized(contentType),
      };
      types.set(experiment.contentType, typeState);
    }

    typeState.controls.add(experiment.controlDocumentId);

    for (const variant of experiment.variants) {
      typeState.variantIds.push(variant.documentId);
      typeState.variants.add(variant.documentId);
    }

    if (isServing(experiment)) {
      typeState.serving.set(
        experiment.controlDocumentId,
        toServing(experiment, typeState.localized)
      );
    }
  }

  // The id lists are handed to the query layer on every list read; make sure nothing there can
  // alter the shared copy.
  for (const typeState of types.values()) {
    Object.freeze(typeState.variantIds);
  }

  return { types };
};

/**
 * In-memory view of every experiment, so the request path never queries the experiment table.
 * It is rebuilt after each write on this instance, and lazily once it is older than `cacheTtl`
 * so other instances of a scaled deployment pick up the change.
 */
const registry = ({ strapi }: { strapi: Core.Strapi }) => {
  let state: RegistryState = { types: new Map() };
  let loadedAt = 0;
  let ttl = 30000;
  let pending: Promise<void> | null = null;

  const load = async () => {
    const rows = await strapi.db.query(EXPERIMENT_UID).findMany();

    state = buildState(strapi, rows.map(normalizeExperiment));
    ttl = strapi.plugin(PLUGIN_ID).config<number>('cacheTtl', 30000);
    loadedAt = Date.now();
  };

  const refresh = async (): Promise<void> => {
    // A load that started before the caller's write may not include it, so run a new one after.
    if (pending) {
      await pending.catch(() => {});
    }

    pending = load().finally(() => {
      pending = null;
    });

    return pending;
  };

  return {
    refresh,

    /** Called on every document read, so it must stay free of lookups and allocations. */
    snapshot(): RegistryState {
      if (!pending && Date.now() - loadedAt > ttl) {
        refresh().catch((error) => {
          strapi.log.error(`[ab-test] Could not reload experiments: ${error.message}`);
        });
      }

      return state;
    },
  };
};

export default registry;
