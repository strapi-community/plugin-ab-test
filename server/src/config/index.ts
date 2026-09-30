export default {
  default: {
    /**
     * How long an instance may serve from its in-memory view of experiments before checking
     * the database again, in milliseconds. Only matters when several instances share a database.
     */
    cacheTtl: 30000,
  },
  validator(config: { cacheTtl?: unknown }) {
    if (typeof config.cacheTtl !== 'number' || config.cacheTtl < 0) {
      throw new Error('ab-test: cacheTtl must be a positive number of milliseconds.');
    }
  },
};
