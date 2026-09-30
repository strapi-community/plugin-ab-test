/**
 * Tells whether a variant still has the content it was cloned with. Works on any content type by
 * walking its schema, so components, dynamic zones, media and relations are compared too.
 */

interface Attribute {
  type: string;
  [key: string]: unknown;
}

export interface Model {
  attributes: Record<string, Attribute>;
}

export type GetComponent = (uid: string) => Model | undefined;

type Entry = Record<string, unknown>;

// Identity and bookkeeping: these differ between two documents whatever their content.
const SYSTEM_FIELDS = new Set([
  'id',
  'documentId',
  'createdAt',
  'updatedAt',
  'publishedAt',
  'createdBy',
  'updatedBy',
  'locale',
  'localizations',
]);

const MAX_DEPTH = 8;

const isCompared = (name: string, attribute: Attribute, isRoot: boolean): boolean => {
  if (SYSTEM_FIELDS.has(name) || attribute.type === 'password') {
    return false;
  }

  // Attributes added by other features (review workflow stage, assignee) are not content.
  if (attribute.visible === false) {
    return false;
  }

  // A variant always gets its own uid at clone time, and the original's is served anyway.
  if (isRoot && attribute.type === 'uid') {
    return false;
  }

  return !(attribute.type === 'relation' && String(attribute.relation).startsWith('morph'));
};

/** The populate needed to load everything `contentKey` compares. */
export const buildPopulate = (
  model: Model,
  getComponent: GetComponent,
  depth = 0,
  isRoot = true
): Record<string, unknown> => {
  const populate: Record<string, unknown> = {};

  if (depth > MAX_DEPTH) {
    return populate;
  }

  const nested = (uid: string) => {
    const component = getComponent(uid);
    const inner = component ? buildPopulate(component, getComponent, depth + 1, false) : {};

    return Object.keys(inner).length > 0 ? { populate: inner } : true;
  };

  for (const [name, attribute] of Object.entries(model.attributes)) {
    if (!isCompared(name, attribute, isRoot)) {
      continue;
    }

    if (attribute.type === 'component') {
      populate[name] = nested(attribute.component as string);
    } else if (attribute.type === 'dynamiczone') {
      populate[name] = {
        on: Object.fromEntries((attribute.components as string[]).map((uid) => [uid, nested(uid)])),
      };
    } else if (attribute.type === 'media') {
      populate[name] = { fields: ['id'] };
    } else if (attribute.type === 'relation') {
      populate[name] = { fields: ['documentId'] };
    }
  }

  return populate;
};

const reference = (value: unknown): unknown => {
  const item = value as { documentId?: string; id?: number } | null | undefined;

  return item?.documentId ?? item?.id ?? null;
};

const references = (value: unknown): unknown =>
  Array.isArray(value) ? value.map(reference) : reference(value);

const normalize = (
  entry: Entry,
  model: Model,
  getComponent: GetComponent,
  isRoot: boolean,
  uniqueSuffix?: string
): Entry => {
  const result: Entry = {};

  const component = (value: unknown, uid: string): Entry | null => {
    const schema = getComponent(uid);

    return value && schema ? normalize(value as Entry, schema, getComponent, false) : null;
  };

  for (const name of Object.keys(model.attributes).sort()) {
    const attribute = model.attributes[name];

    if (!isCompared(name, attribute, isRoot)) {
      continue;
    }

    const value = entry[name];

    if (attribute.type === 'component') {
      const uid = attribute.component as string;

      result[name] = Array.isArray(value)
        ? value.map((item) => component(item, uid))
        : component(value, uid);
    } else if (attribute.type === 'dynamiczone') {
      result[name] = (Array.isArray(value) ? value : []).map((item: Entry) => ({
        __component: item.__component,
        ...component(item, item.__component as string),
      }));
    } else if (attribute.type === 'media' || attribute.type === 'relation') {
      result[name] = references(value);
    } else if (
      isRoot &&
      uniqueSuffix &&
      attribute.unique === true &&
      typeof value === 'string' &&
      value.endsWith(uniqueSuffix)
    ) {
      // Unique text fields were suffixed at clone time so the clone could be saved.
      result[name] = value.slice(0, -uniqueSuffix.length);
    } else {
      result[name] = value ?? null;
    }
  }

  return result;
};

/**
 * A string that is equal for two entries exactly when their content is. Pass the suffix a
 * variant's unique fields were given at clone time so that alone does not count as a change.
 */
export const contentKey = (
  entry: Entry,
  model: Model,
  getComponent: GetComponent,
  uniqueSuffix?: string
): string => JSON.stringify(normalize(entry, model, getComponent, true, uniqueSuffix));

export const uniqueSuffix = (variantKey: string) => ` [${variantKey.toUpperCase()}]`;
