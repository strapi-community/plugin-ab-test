import { CONTROL_KEY, EXPOSURE_EVENT, PAGEVIEW_EVENT } from '../constants';
import type { Experiment, Goal, VersionResult } from '../types';

import { meanSignificance, proportionSignificance, uplift } from './stats';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Where PostHog starts reading events. A day before the experiment was created, because the
 * date is read in the timezone of the PostHog project, which the plugin does not know.
 */
const since = (createdAt: string | null): string =>
  new Date((createdAt ? Date.parse(createdAt) : 0) - DAY_MS)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');

/**
 * One row per version: its visitors, then what they did after their first exposure. A visitor
 * counts for the version they saw first, and only for what happened after they saw it.
 */
export const buildResultsQuery = (
  experiment: Pick<Experiment, 'key' | 'createdAt'>,
  goal: Goal
) => {
  // Innermost: one row per visitor. Then what each did after being exposed. Then the versions.
  // Kept as separate levels so that no expression depends on an alias of its own level.
  const [collected, outcome] =
    goal.type === 'conversion'
      ? ['maxIf(timestamp, event = {goal}) AS last_at', 'if(last_at > exposed_at, 1, 0)']
      : [
          'groupArrayIf(timestamp, event = {goal}) AS times',
          'arrayCount(t -> t > exposed_at, times)',
        ];

  return {
    query: `
SELECT variant, count() AS visitors, sum(outcome) AS total, varSamp(outcome) AS variance
FROM (
    SELECT variant, ${outcome} AS outcome
    FROM (
        SELECT
            person_id,
            argMinIf(toString(properties.variant), timestamp, event = {exposure}) AS variant,
            minIf(timestamp, event = {exposure}) AS exposed_at,
            ${collected}
        FROM events
        WHERE timestamp >= toDateTime({since})
            AND ((event = {exposure} AND properties.experiment = {experiment}) OR event = {goal})
        GROUP BY person_id
        HAVING countIf(event = {exposure}) > 0
    )
)
GROUP BY variant
LIMIT 100`.trim(),
    values: {
      exposure: EXPOSURE_EVENT,
      experiment: experiment.key,
      goal: goal.type === 'conversion' ? goal.event : PAGEVIEW_EVENT,
      since: since(experiment.createdAt),
    },
  };
};

const toNumber = (value: unknown): number => {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
};

/**
 * Turns the rows PostHog answered into one result per version of the experiment, original
 * first. Versions PostHog knows nothing about get zeros; rows for unknown versions are dropped.
 */
export const toVersionResults = (
  experiment: Pick<Experiment, 'variants'>,
  goal: Goal,
  rows: unknown[][]
): VersionResult[] => {
  const byKey = new Map(rows.map((row) => [String(row[0]), row]));

  const read = (key: string) => {
    const row = byKey.get(key);
    const visitors = toNumber(row?.[1]);
    const count = toNumber(row?.[2]);

    return {
      key,
      visitors,
      count,
      value: visitors > 0 ? count / visitors : null,
      variance: toNumber(row?.[3]),
    };
  };

  const control = read(CONTROL_KEY);

  const compare = (version: ReturnType<typeof read>): number | null => {
    if (control.value === null || version.value === null) {
      return null;
    }

    return goal.type === 'conversion'
      ? proportionSignificance(
          { visitors: control.visitors, conversions: control.count },
          { visitors: version.visitors, conversions: version.count }
        )
      : meanSignificance(
          { visitors: control.visitors, mean: control.value, variance: control.variance },
          { visitors: version.visitors, mean: version.value, variance: version.variance }
        );
  };

  return [control, ...experiment.variants.map((variant) => read(variant.key))].map((version) => ({
    key: version.key,
    visitors: version.visitors,
    count: version.count,
    value: version.value,
    uplift: version.key === CONTROL_KEY ? null : uplift(control.value, version.value),
    significance: version.key === CONTROL_KEY ? null : compare(version),
  }));
};

/** Says why PostHog refused a query, in words an administrator can act on. */
export const describeFailure = (
  status: number,
  detail: string,
  config: { host: string; projectId: string }
): string => {
  if (status === 401 || status === 403) {
    return 'PostHog refused the API key. It must be a personal API key (phx_…) with the "Query Read" scope and access to this project.';
  }

  if (status === 404) {
    return `PostHog project ${config.projectId} was not found on ${config.host}. Check posthog.projectId, and posthog.host for your region (us.posthog.com or eu.posthog.com).`;
  }

  if (status === 429) {
    return 'PostHog is rate limiting this project. Results will be back in a moment.';
  }

  return `PostHog answered ${status}${detail ? `: ${detail}` : '.'}`;
};
