export const CONTROL_KEY = 'control';

/** Variant keys in the order the server hands them out. */
export const VARIANT_KEYS = ['b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

export const PERMISSIONS = {
  read: [{ action: 'plugin::ab-test.read', subject: null }],
  manage: [{ action: 'plugin::ab-test.manage', subject: null }],
  settings: [{ action: 'plugin::ab-test.settings', subject: null }],
};
