import { randomBytes } from 'node:crypto';

import type { Core, UID } from '@strapi/strapi';
import { errors } from '@strapi/utils';

import { CONTROL_KEY, EXPERIMENT_UID, VARIANT_KEYS } from '../constants';
import type { DisposeMode, Experiment, Variant } from '../types';
import {
  getContentType,
  getService,
  hasDraftAndPublish,
  isEligible,
  normalizeExperiment,
} from '../utils';

const { ValidationError, NotFoundError } = errors;

export type StatusAction = 'start' | 'pause' | 'complete';

export interface CreateInput {
  contentType: string;
  controlDocumentId: string;
  name?: string;
  hypothesis?: string | null;
}

export interface UpdateInput {
  name?: string;
  hypothesis?: string | null;
  /** Variant key → share of traffic in percent. */
  weights?: Record<string, number>;
  startAt?: string | null;
  endAt?: string | null;
  locales?: string[] | null;
}

export interface Lookup {
  experiment: Experiment;
  role: 'control' | 'variant';
  variantKey: string;
}

const totalWeight = (variants: Variant[]) =>
  variants.reduce((sum, variant) => sum + variant.weight, 0);

/** Splits traffic evenly between the control and every variant. */
const equalize = (variants: Variant[]): Variant[] => {
  const share = Math.floor(100 / (variants.length + 1));

  return variants.map((variant) => ({ ...variant, weight: share }));
};

const parseDate = (value: string | null, field: string): string | null => {
  if (value === null || value === '') {
    return null;
  }

  const time = Date.parse(value);

  if (Number.isNaN(time)) {
    throw new ValidationError(`${field} is not a valid date.`);
  }

  return new Date(time).toISOString();
};

const experiments = ({ strapi }: { strapi: Core.Strapi }) => {
  const query = () => strapi.db.query(EXPERIMENT_UID);
  const documents = () => strapi.documents(EXPERIMENT_UID as UID.ContentType);
  const registry = () => getService(strapi, 'registry');

  const findAll = async (): Promise<Experiment[]> => {
    const rows = await query().findMany({ orderBy: { createdAt: 'desc' } });

    return rows.map(normalizeExperiment);
  };

  const findOne = async (documentId: string): Promise<Experiment> => {
    const row = await query().findOne({ where: { documentId } });

    if (!row) {
      throw new NotFoundError('Experiment not found.');
    }

    return normalizeExperiment(row);
  };

  const findByContentType = async (contentType: string): Promise<Experiment[]> => {
    const rows = await query().findMany({ where: { contentType } });

    return rows.map(normalizeExperiment);
  };

  /** Finds the experiment a document takes part in, as its control or as one of its variants. */
  const lookup = async (contentType: string, documentId: string): Promise<Lookup | null> => {
    for (const experiment of await findByContentType(contentType)) {
      if (experiment.controlDocumentId === documentId) {
        return { experiment, role: 'control', variantKey: CONTROL_KEY };
      }

      const variant = experiment.variants.find((item) => item.documentId === documentId);

      if (variant) {
        return { experiment, role: 'variant', variantKey: variant.key };
      }
    }

    return null;
  };

  /**
   * Visitors only ever get published content, so an experiment whose variants are all drafts
   * would run without changing anything. Caught at start, where the editor can act on it.
   */
  const hasServableVariant = async (experiment: Experiment): Promise<boolean> => {
    const contentType = getContentType(strapi, experiment.contentType);

    if (!contentType || !hasDraftAndPublish(contentType)) {
      return true;
    }

    const published = await strapi.db.query(experiment.contentType).count({
      where: {
        documentId: {
          $in: experiment.variants
            .filter((variant) => variant.weight > 0)
            .map((variant) => variant.documentId),
        },
        publishedAt: { $notNull: true },
      },
    });

    return published > 0;
  };

  const save = async (documentId: string, data: Record<string, unknown>): Promise<Experiment> => {
    await documents().update({ documentId, data } as never);
    await registry().refresh();

    return findOne(documentId);
  };

  const addVariant = async (documentId: string): Promise<Experiment> => {
    const experiment = await findOne(documentId);

    if (experiment.status === 'running' || experiment.status === 'completed') {
      throw new ValidationError('Pause the experiment before adding a variant.');
    }

    const key = VARIANT_KEYS.find(
      (candidate) => !experiment.variants.some((variant) => variant.key === candidate)
    );

    if (!key) {
      throw new ValidationError(`An experiment can have at most ${VARIANT_KEYS.length} variants.`);
    }

    const unchanged = await getService(strapi, 'variants').findUnchanged(
      experiment.contentType,
      experiment.controlDocumentId,
      experiment.variants
    );

    if (unchanged.length > 0) {
      throw new ValidationError(
        `Variant ${unchanged[0].toUpperCase()} is still identical to the original. Change it before adding another variant.`
      );
    }

    const variantDocumentId = await getService(strapi, 'variants').clone(
      experiment.contentType,
      experiment.controlDocumentId,
      key
    );

    const variants = [...experiment.variants, { key, documentId: variantDocumentId, weight: 0 }];

    return save(documentId, {
      // Before the first start nobody has tuned the split yet, so keep it even.
      variants: experiment.status === 'draft' ? equalize(variants) : variants,
    });
  };

  const remove = async (documentId: string, mode: DisposeMode): Promise<void> => {
    const experiment = await findOne(documentId);

    for (const variant of experiment.variants) {
      await getService(strapi, 'variants').dispose(
        experiment.contentType,
        variant.documentId,
        mode
      );
    }

    await documents().delete({ documentId } as never);
    await registry().refresh();
  };

  return {
    findAll,
    findOne,
    lookup,
    addVariant,
    remove,

    /** Keys of the variants that have not been changed since they were cloned. */
    async unchangedVariants(documentId: string): Promise<string[]> {
      const experiment = await findOne(documentId);

      return getService(strapi, 'variants').findUnchanged(
        experiment.contentType,
        experiment.controlDocumentId,
        experiment.variants
      );
    },

    /** Experiments of the given documents, keyed by control documentId. */
    async lookupMany(contentType: string, documentIds: string[]) {
      const wanted = new Set(documentIds);
      const result: Record<string, Pick<Experiment, 'documentId' | 'key' | 'name' | 'status'>> = {};

      for (const experiment of await findByContentType(contentType)) {
        if (wanted.has(experiment.controlDocumentId)) {
          result[experiment.controlDocumentId] = {
            documentId: experiment.documentId,
            key: experiment.key,
            name: experiment.name,
            status: experiment.status,
          };
        }
      }

      return result;
    },

    /** Creates a draft experiment for an entry, with a first variant cloned from it. */
    async create(input: CreateInput): Promise<Experiment> {
      const contentType = getContentType(strapi, input.contentType);

      if (!contentType || !isEligible(contentType)) {
        throw new ValidationError('A/B testing is only available on collection types.');
      }

      if (!(await getService(strapi, 'settings').isEnabled(input.contentType))) {
        throw new ValidationError('A/B testing is not enabled for this content type.');
      }

      const existing = await lookup(input.contentType, input.controlDocumentId);

      if (existing) {
        throw new ValidationError(
          existing.role === 'control'
            ? 'This entry already has an experiment.'
            : 'A variant cannot have its own experiment.'
        );
      }

      const control = await strapi.db
        .query(input.contentType)
        .findOne({ where: { documentId: input.controlDocumentId }, select: ['id'] });

      if (!control) {
        throw new NotFoundError('The entry to test does not exist.');
      }

      const created = await documents().create({
        data: {
          key: `${contentType.info.singularName}-${randomBytes(3).toString('hex')}`,
          name: input.name?.trim() || `${contentType.info.displayName} A/B test`,
          hypothesis: input.hypothesis ?? null,
          contentType: input.contentType,
          controlDocumentId: input.controlDocumentId,
          variants: [],
          status: 'draft',
        },
      } as never);

      try {
        return await addVariant(created.documentId);
      } catch (error) {
        // An experiment without its first variant is of no use to the editor.
        await documents().delete({ documentId: created.documentId } as never);
        await registry().refresh();
        throw error;
      }
    },

    async update(documentId: string, input: UpdateInput): Promise<Experiment> {
      const experiment = await findOne(documentId);
      const data: Record<string, unknown> = {};

      if (input.name !== undefined) {
        if (typeof input.name !== 'string' || input.name.trim() === '') {
          throw new ValidationError('The experiment needs a name.');
        }
        data.name = input.name.trim();
      }

      if (input.hypothesis !== undefined) {
        data.hypothesis = input.hypothesis;
      }

      if (input.weights !== undefined) {
        const variants = experiment.variants.map((variant) => ({
          ...variant,
          weight: input.weights?.[variant.key] ?? variant.weight,
        }));

        const invalid = variants.some(
          (variant) =>
            !Number.isFinite(variant.weight) || variant.weight < 0 || variant.weight > 100
        );

        if (invalid || totalWeight(variants) > 100) {
          throw new ValidationError(
            'Each share must be between 0 and 100, and variants cannot add up to more than 100%.'
          );
        }

        data.variants = variants;
      }

      if (input.startAt !== undefined) {
        data.startAt = parseDate(input.startAt, 'Start date');
      }

      if (input.endAt !== undefined) {
        data.endAt = parseDate(input.endAt, 'End date');
      }

      const startAt = 'startAt' in data ? (data.startAt as string | null) : experiment.startAt;
      const endAt = 'endAt' in data ? (data.endAt as string | null) : experiment.endAt;

      if (startAt && endAt && Date.parse(endAt) <= Date.parse(startAt)) {
        throw new ValidationError('The end date must be after the start date.');
      }

      if (input.locales !== undefined) {
        const valid =
          input.locales === null ||
          (Array.isArray(input.locales) && input.locales.every((item) => typeof item === 'string'));

        if (!valid) {
          throw new ValidationError('Locales must be a list of locale codes.');
        }

        data.locales = input.locales && input.locales.length > 0 ? input.locales : null;
      }

      return save(documentId, data);
    },

    async setStatus(
      documentId: string,
      action: StatusAction,
      options: { winner?: string } = {}
    ): Promise<Experiment> {
      const experiment = await findOne(documentId);

      if (action === 'start') {
        if (experiment.status !== 'draft' && experiment.status !== 'paused') {
          throw new ValidationError('Only a draft or paused experiment can be started.');
        }

        if (totalWeight(experiment.variants) <= 0) {
          throw new ValidationError(
            'Give at least one variant a share of traffic before starting.'
          );
        }

        // A variant that still equals the original would split traffic between two copies of
        // the same content. Creating a variant saves a copy right away, so this is what an
        // editor gets by starting before saving any change.
        const unchanged = await getService(strapi, 'variants').findUnchanged(
          experiment.contentType,
          experiment.controlDocumentId,
          experiment.variants.filter((variant) => variant.weight > 0)
        );

        if (unchanged.length > 0) {
          throw new ValidationError(
            `Variant ${unchanged[0].toUpperCase()} is still identical to the original. Change and save it before starting the experiment.`
          );
        }

        if (!(await hasServableVariant(experiment))) {
          throw new ValidationError(
            'Publish at least one variant before starting: an unpublished variant is never served.'
          );
        }

        return save(documentId, { status: 'running' });
      }

      if (action === 'pause') {
        if (experiment.status !== 'running') {
          throw new ValidationError('Only a running experiment can be paused.');
        }

        return save(documentId, { status: 'paused' });
      }

      if (action === 'complete') {
        const winner = options.winner ?? CONTROL_KEY;
        const known =
          winner === CONTROL_KEY || experiment.variants.some((variant) => variant.key === winner);

        if (!known) {
          throw new ValidationError('The winner must be the original or one of the variants.');
        }

        return save(documentId, { status: 'completed', winner });
      }

      throw new ValidationError(`Unknown action: ${String(action)}`);
    },

    /**
     * Drops a variant that was never changed, so leaving a fresh copy behind does not create
     * it. An experiment left without variants goes with it, since creating the first variant is
     * what created the experiment.
     */
    async discardUnchangedVariant(
      documentId: string,
      key: string
    ): Promise<{ discarded: boolean; experimentDeleted: boolean }> {
      const experiment = await findOne(documentId);
      const variant = experiment.variants.find((item) => item.key === key);

      if (!variant) {
        throw new NotFoundError('Variant not found.');
      }

      const unchanged = await getService(strapi, 'variants').findUnchanged(
        experiment.contentType,
        experiment.controlDocumentId,
        [variant]
      );

      if (unchanged.length === 0) {
        return { discarded: false, experimentDeleted: false };
      }

      if (experiment.variants.length === 1) {
        await remove(documentId, 'delete');

        return { discarded: true, experimentDeleted: true };
      }

      await getService(strapi, 'variants').dispose(
        experiment.contentType,
        variant.documentId,
        'delete'
      );
      await save(documentId, {
        variants: experiment.variants.filter((item) => item.key !== key),
        ...(experiment.winner === key ? { winner: CONTROL_KEY } : {}),
      });

      return { discarded: true, experimentDeleted: false };
    },

    async removeVariant(documentId: string, key: string, mode: DisposeMode): Promise<Experiment> {
      const experiment = await findOne(documentId);
      const variant = experiment.variants.find((item) => item.key === key);

      if (!variant) {
        throw new NotFoundError('Variant not found.');
      }

      if (experiment.status === 'running') {
        throw new ValidationError('Pause the experiment before removing a variant.');
      }

      if (experiment.status === 'completed' && experiment.winner === key) {
        throw new ValidationError('The winning variant is being served and cannot be removed.');
      }

      await getService(strapi, 'variants').dispose(
        experiment.contentType,
        variant.documentId,
        mode
      );

      return save(documentId, {
        variants: experiment.variants.filter((item) => item.key !== key),
      });
    },

    /**
     * Keeps experiments consistent when an editor deletes a tested entry from the Content
     * Manager: variants of a deleted control would otherwise stay hidden forever.
     */
    async handleDocumentDeleted(contentType: string, documentId: string): Promise<void> {
      // Deleting one locale leaves the document in place.
      const remaining = await strapi.db.query(contentType).count({ where: { documentId } });

      if (remaining > 0) {
        return;
      }

      const found = await lookup(contentType, documentId);

      if (!found) {
        return;
      }

      if (found.role === 'control') {
        await remove(found.experiment.documentId, 'delete');
        return;
      }

      const variants = found.experiment.variants.filter((item) => item.documentId !== documentId);
      const data: Record<string, unknown> = { variants };

      if (variants.length === 0 && found.experiment.status === 'running') {
        data.status = 'paused';
      }

      if (found.experiment.winner === found.variantKey) {
        data.winner = CONTROL_KEY;
      }

      await save(found.experiment.documentId, data);
    },
  };
};

export default experiments;
