import type { Core } from '@strapi/strapi';

import { CONTROL_KEY } from '../constants';
import type { DisposeMode, Experiment } from '../types';
import { getService } from '../utils';

import type { StatusAction } from './experiments';

type Payload = {
  eventProperties?: Record<string, unknown>;
  groupProperties?: Record<string, unknown>;
};

const STATUS_EVENTS: Record<StatusAction, string> = {
  start: 'didStartABTestExperiment',
  pause: 'didPauseABTestExperiment',
  complete: 'didCompleteABTestExperiment',
};

/**
 * Usage events sent through Strapi's own telemetry, so they follow the project's opt-out. They
 * only carry counts and flags: never a name, a key, a content type or a document id.
 */
const metrics = ({ strapi }: { strapi: Core.Strapi }) => {
  // Not awaited: telemetry must never slow down or fail the action it reports.
  const send = (event: string, payload: Payload = {}) => {
    strapi.telemetry.send(event, payload).catch(() => {});
  };

  return {
    async sendDidInitializeEvent() {
      if (strapi.telemetry.isDisabled) {
        return;
      }

      try {
        const [settings, experiments] = await Promise.all([
          getService(strapi, 'settings').get(),
          getService(strapi, 'experiments').findAll(),
        ]);

        send('didInitializeABTest', {
          groupProperties: {
            numberOfABTestContentTypes: settings.contentTypes.length,
            numberOfABTestExperiments: experiments.length,
            numberOfRunningABTestExperiments: experiments.filter(
              (experiment) => experiment.status === 'running'
            ).length,
          },
        });
      } catch {
        // Nothing to report is better than a failed start.
      }
    },

    sendDidUpdateSettings(numberOfABTestContentTypes: number) {
      send('didUpdateABTestSettings', { groupProperties: { numberOfABTestContentTypes } });
    },

    sendDidCreateExperiment() {
      send('didCreateABTestExperiment');
    },

    sendDidSetStatus(action: StatusAction, experiment: Experiment) {
      send(STATUS_EVENTS[action], {
        eventProperties: {
          numberOfVariants: experiment.variants.length,
          ...(action === 'start' && {
            hasSchedule: experiment.startAt !== null || experiment.endAt !== null,
            hasLocaleScope: experiment.locales !== null,
          }),
          ...(action === 'complete' && {
            winner: experiment.winner === CONTROL_KEY ? 'control' : 'variant',
          }),
        },
      });
    },

    sendDidDeleteExperiment(variantsDisposal: DisposeMode) {
      send('didDeleteABTestExperiment', { eventProperties: { variantsDisposal } });
    },

    sendDidAddVariant(experiment: Experiment) {
      send('didAddABTestVariant', {
        eventProperties: { numberOfVariants: experiment.variants.length },
      });
    },

    sendDidRemoveVariant(variantsDisposal: DisposeMode) {
      send('didRemoveABTestVariant', { eventProperties: { variantsDisposal } });
    },

    /** An untouched variant dropped when its editor left: the experiment was never set up. */
    sendDidDiscardVariant(experimentDeleted: boolean) {
      send('didDiscardABTestVariant', { eventProperties: { experimentDeleted } });
    },

    sendDidPrepareUninstall(
      variantsDisposal: DisposeMode,
      removed: { experiments: number; variants: number }
    ) {
      send('didPrepareABTestUninstall', {
        eventProperties: {
          variantsDisposal,
          numberOfExperiments: removed.experiments,
          numberOfVariants: removed.variants,
        },
        // Nothing is left to count, and the plugin will not be there to say so later.
        groupProperties: {
          numberOfABTestContentTypes: 0,
          numberOfABTestExperiments: 0,
          numberOfRunningABTestExperiments: 0,
        },
      });
    },
  };
};

export default metrics;
