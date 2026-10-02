/** Below this many visitors in a version, a test would say more about luck than about content. */
const MIN_VISITORS = 30;

/** The normal approximation needs this many expected conversions and non-conversions per version. */
const MIN_EXPECTED = 5;

// Abramowitz and Stegun 7.1.26, accurate to about 1e-7: plenty for a percentage.
const erf = (x: number): number => {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const polynomial =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  const value = 1 - polynomial * Math.exp(-x * x);

  return x >= 0 ? value : -value;
};

/** Two-sided significance of a z-score: 1 - p-value, from 0 to 1. */
const significanceOf = (z: number): number => erf(Math.abs(z) / Math.SQRT2);

export interface Proportion {
  visitors: number;
  conversions: number;
}

export interface Mean {
  visitors: number;
  mean: number;
  variance: number;
}

/**
 * How unlikely the difference between two conversion rates is to come from chance alone, from
 * 0 to 1 (two-proportion z-test). Null while the samples are too small for the test to hold.
 */
export const proportionSignificance = (control: Proportion, variant: Proportion): number | null => {
  const visitors = control.visitors + variant.visitors;

  if (control.visitors < MIN_VISITORS || variant.visitors < MIN_VISITORS) {
    return null;
  }

  const pooled = (control.conversions + variant.conversions) / visitors;
  const smallest = Math.min(control.visitors, variant.visitors);

  if (smallest * pooled < MIN_EXPECTED || smallest * (1 - pooled) < MIN_EXPECTED) {
    return null;
  }

  const error = Math.sqrt(pooled * (1 - pooled) * (1 / control.visitors + 1 / variant.visitors));
  const difference =
    variant.conversions / variant.visitors - control.conversions / control.visitors;

  return significanceOf(difference / error);
};

/**
 * The same for two averages, such as page views per visitor (Welch's test, with the normal
 * approximation that large samples allow). Null while the samples are too small or all equal.
 */
export const meanSignificance = (control: Mean, variant: Mean): number | null => {
  if (control.visitors < MIN_VISITORS || variant.visitors < MIN_VISITORS) {
    return null;
  }

  const error = Math.sqrt(
    control.variance / control.visitors + variant.variance / variant.visitors
  );

  if (!Number.isFinite(error) || error === 0) {
    return null;
  }

  return significanceOf((variant.mean - control.mean) / error);
};

/** Relative difference of a value with the original's. Null when the original has none. */
export const uplift = (control: number | null, value: number | null): number | null =>
  control === null || value === null || control === 0 ? null : (value - control) / control;
