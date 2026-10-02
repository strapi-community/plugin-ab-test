export const PLUGIN_ID = 'ab-test';

export const EXPERIMENT_UID = 'plugin::ab-test.experiment';

/** Content API query params registered by the plugin. */
export const SEED_PARAM = 'abSeed';
export const VARIANT_PARAM = 'abVariant';

/** Key of the original entry in an experiment. */
export const CONTROL_KEY = 'control';

/** Key added to served entries so frontends can report exposure. */
export const LABEL_KEY = 'abTest';

/**
 * The convention PostHog results rely on: the event a frontend sends when a visitor sees a
 * tested entry, with the `experiment` and `variant` properties taken from the label.
 */
export const EXPOSURE_EVENT = 'ab_test_exposure';

/** The event PostHog records for a page view, which a page views metric counts. */
export const PAGEVIEW_EVENT = '$pageview';

export const POSTHOG_DEFAULT_HOST = 'https://us.posthog.com';

/** Variant keys, in the order they are handed out. */
export const VARIANT_KEYS = ['b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

export const STORE_KEY = 'settings';

/** Where a PostHog connection saved from the settings page is kept, its key encrypted. */
export const POSTHOG_STORE_KEY = 'posthog';

export const ACTIONS = {
  read: 'plugin::ab-test.read',
  manage: 'plugin::ab-test.manage',
  settings: 'plugin::ab-test.settings',
} as const;

export const CM_ACTIONS = {
  read: 'plugin::content-manager.explorer.read',
  create: 'plugin::content-manager.explorer.create',
  delete: 'plugin::content-manager.explorer.delete',
} as const;
