import { createHash } from 'node:crypto';

import { CONTROL_KEY } from '../constants';
import type { ServingExperiment } from '../types';

/**
 * Maps a seed to a stable point in [0, 1). The experiment key is part of the hash so the same
 * visitor lands in unrelated buckets across experiments.
 */
export const bucket = (experimentKey: string, seed: string): number =>
  createHash('sha256').update(`${experimentKey}:${seed}`).digest().readUInt32BE(0) / 0x100000000;

export const pickVariant = (
  experiment: Pick<ServingExperiment, 'key' | 'variants'>,
  seed: string
): string => {
  const point = bucket(experiment.key, seed) * 100;

  let upper = 0;
  for (const variant of experiment.variants) {
    upper += variant.weight;
    if (point < upper) {
      return variant.key;
    }
  }

  return CONTROL_KEY;
};

const hasKey = (experiment: ServingExperiment, key: string) =>
  key === CONTROL_KEY || experiment.variants.some((variant) => variant.key === key);

interface ResolveOptions {
  seed?: string;
  forced?: string;
  locale?: string | null;
  now: number;
}

/**
 * Returns the key to serve for this request, or null when the experiment does not apply
 * (not running, outside its schedule or locales, or no seed to assign with).
 */
export const resolveVariantKey = (
  experiment: ServingExperiment,
  { seed, forced, locale, now }: ResolveOptions
): string | null => {
  if (experiment.status === 'completed') {
    return experiment.winner && experiment.winner !== CONTROL_KEY ? experiment.winner : null;
  }

  if (experiment.status !== 'running') {
    return null;
  }

  if (experiment.startMs !== null && now < experiment.startMs) {
    return null;
  }

  if (experiment.endMs !== null && now >= experiment.endMs) {
    return null;
  }

  if (experiment.locales && (!locale || !experiment.locales.has(locale))) {
    return null;
  }

  if (forced && hasKey(experiment, forced)) {
    return forced;
  }

  return seed ? pickVariant(experiment, seed) : null;
};
