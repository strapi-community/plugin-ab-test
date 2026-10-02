const isOptionalText = (value: unknown) =>
  value === undefined || value === null || typeof value === 'string' || typeof value === 'number';

export default {
  default: {
    /**
     * How long an instance may serve from its in-memory view of experiments before checking
     * the database again, in milliseconds. Only matters when several instances share a database.
     */
    cacheTtl: 30000,
    /**
     * Optional. Reads the results of experiments from PostHog:
     * `{ host, projectId, personalApiKey }`. Left out, or without a project id and a key, the
     * plugin serves variants as usual and shows no results.
     */
    posthog: undefined,
  },
  validator(config: { cacheTtl?: unknown; posthog?: unknown }) {
    if (typeof config.cacheTtl !== 'number' || config.cacheTtl < 0) {
      throw new Error('ab-test: cacheTtl must be a positive number of milliseconds.');
    }

    if (config.posthog === undefined || config.posthog === null) {
      return;
    }

    if (typeof config.posthog !== 'object') {
      throw new Error('ab-test: posthog must be an object with host, projectId, personalApiKey.');
    }

    const { host, projectId, personalApiKey } = config.posthog as Record<string, unknown>;

    // Unset environment variables are fine: PostHog is simply not connected.
    if (![host, projectId, personalApiKey].every(isOptionalText)) {
      throw new Error('ab-test: posthog.host, projectId and personalApiKey must be strings.');
    }

    if (host && !/^https?:\/\//.test(String(host))) {
      throw new Error('ab-test: posthog.host must be a URL, such as https://eu.posthog.com.');
    }
  },
};
