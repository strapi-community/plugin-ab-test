import { CONTROL_KEY, VARIANT_KEYS } from '../constants';
import type { Experiment, Goal } from '../types';

import type { useT } from './useT';

export const variantName = (key: string) =>
  key === CONTROL_KEY ? 'Original' : `Variant ${key.toUpperCase()}`;

/** A success metric in one line, for the list of experiments and the choice of a winner. */
export const goalLabel = (goal: Goal, t: ReturnType<typeof useT>) =>
  goal.type === 'conversion'
    ? t('goal.conversion', 'Conversion ({event})', { event: goal.event ?? '' })
    : t('goal.pageviews', 'Page views');

export const controlShare = (experiment: Pick<Experiment, 'variants'>) =>
  Math.max(0, 100 - experiment.variants.reduce((sum, variant) => sum + variant.weight, 0));

export const splitSummary = (experiment: Pick<Experiment, 'variants'>) =>
  [
    `${variantName(CONTROL_KEY)} ${controlShare(experiment)}%`,
    ...experiment.variants.map((variant) => `${variant.key.toUpperCase()} ${variant.weight}%`),
  ].join(' · ');

export const editPath = (contentType: string, documentId: string, search = '') =>
  `/content-manager/collection-types/${contentType}/${documentId}${search}`;

/** Every version of an experiment and the document that holds it, original first. */
export const versionTargets = (
  experiment: Pick<Experiment, 'controlDocumentId' | 'variants'>
): Record<string, string> => ({
  [CONTROL_KEY]: experiment.controlDocumentId,
  ...Object.fromEntries(experiment.variants.map((variant) => [variant.key, variant.documentId])),
});

/** The key the next variant of an experiment would get, or undefined once every key is taken. */
export const nextVariantKey = (experiment: Pick<Experiment, 'variants'>): string | undefined =>
  VARIANT_KEYS.find((key) => !experiment.variants.some((variant) => variant.key === key));
