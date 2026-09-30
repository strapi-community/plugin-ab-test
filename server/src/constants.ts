export const PLUGIN_ID = 'ab-test';

export const EXPERIMENT_UID = 'plugin::ab-test.experiment';

/** Content API query params registered by the plugin. */
export const SEED_PARAM = 'abSeed';
export const VARIANT_PARAM = 'abVariant';

/** Key of the original entry in an experiment. */
export const CONTROL_KEY = 'control';

/** Key added to served entries so frontends can report exposure. */
export const LABEL_KEY = 'abTest';

/** Variant keys, in the order they are handed out. */
export const VARIANT_KEYS = ['b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

export const STORE_KEY = 'settings';

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
