import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import type { Context } from 'koa';

import { CM_ACTIONS } from '../constants';
import type { StatusAction } from '../services/experiments';
import type { DisposeMode } from '../types';
import { getService } from '../utils';

const { ValidationError, ForbiddenError } = errors;

const STATUS_ACTIONS = new Set<string>(['start', 'pause', 'complete']);

const requireString = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || value === '') {
    throw new ValidationError(`${name} is required.`);
  }

  return value;
};

const toDisposeMode = (value: unknown): DisposeMode => (value === 'keep' ? 'keep' : 'delete');

/**
 * Creating or deleting a variant creates or deletes an entry, so the user needs the matching
 * Content Manager permission on the content type on top of the plugin's own permission.
 */
const assertCan = (ctx: Context, action: string, contentType: string) => {
  if (ctx.state.userAbility?.cannot(action, contentType)) {
    throw new ForbiddenError('You are not allowed to do this on this content type.');
  }
};

const canRead = (ctx: Context, contentType: string) =>
  ctx.state.userAbility?.can(CM_ACTIONS.read, contentType) === true;

const experiment = ({ strapi }: { strapi: Core.Strapi }) => {
  const service = () => getService(strapi, 'experiments');
  const metrics = () => getService(strapi, 'metrics');

  return {
    async find(ctx: Context) {
      ctx.body = { data: await service().findAll() };
    },

    async findOne(ctx: Context) {
      ctx.body = { data: await service().findOne(ctx.params.documentId) };
    },

    /** Tells the edit view whether the open document is a control, a variant, or neither. */
    async lookup(ctx: Context) {
      const contentType = requireString(ctx.query.contentType, 'contentType');
      const documentId = requireString(ctx.query.documentId, 'documentId');

      ctx.body = {
        // Experiments describe entries, so they follow the read permission of the content type.
        data: canRead(ctx, contentType) ? await service().lookup(contentType, documentId) : null,
        enabled: await getService(strapi, 'settings').isEnabled(contentType),
      };
    },

    /** One request for a whole list page, instead of one lookup per row. */
    async lookupMany(ctx: Context) {
      const { contentType, documentIds } = ctx.request.body ?? {};

      if (!Array.isArray(documentIds) || documentIds.some((id) => typeof id !== 'string')) {
        throw new ValidationError('documentIds must be a list of document ids.');
      }

      requireString(contentType, 'contentType');

      ctx.body = {
        data: canRead(ctx, contentType) ? await service().lookupMany(contentType, documentIds) : {},
      };
    },

    async create(ctx: Context) {
      const { contentType, controlDocumentId, name, hypothesis } = ctx.request.body ?? {};

      requireString(contentType, 'contentType');
      requireString(controlDocumentId, 'controlDocumentId');
      assertCan(ctx, CM_ACTIONS.create, contentType);

      const created = await service().create({ contentType, controlDocumentId, name, hypothesis });

      metrics().sendDidCreateExperiment();
      ctx.body = { data: created };
    },

    async update(ctx: Context) {
      const { name, hypothesis, weights, startAt, endAt, locales } = ctx.request.body ?? {};

      ctx.body = {
        data: await service().update(ctx.params.documentId, {
          name,
          hypothesis,
          weights,
          startAt,
          endAt,
          locales,
        }),
      };
    },

    async setStatus(ctx: Context) {
      const { action } = ctx.params;

      if (!STATUS_ACTIONS.has(action)) {
        throw new ValidationError(`Unknown action: ${action}`);
      }

      const updated = await service().setStatus(ctx.params.documentId, action as StatusAction, {
        winner: ctx.request.body?.winner,
      });

      metrics().sendDidSetStatus(action as StatusAction, updated);
      ctx.body = { data: updated };
    },

    async delete(ctx: Context) {
      const mode = toDisposeMode(ctx.query.variants);
      const current = await service().findOne(ctx.params.documentId);

      if (mode === 'delete') {
        assertCan(ctx, CM_ACTIONS.delete, current.contentType);
      }

      await service().remove(ctx.params.documentId, mode);
      metrics().sendDidDeleteExperiment(mode);
      ctx.body = { data: { documentId: ctx.params.documentId } };
    },

    /** Lets the panel disable "Add a variant" while an existing variant equals the original. */
    async unchangedVariants(ctx: Context) {
      ctx.body = { data: await service().unchangedVariants(ctx.params.documentId) };
    },

    async addVariant(ctx: Context) {
      const current = await service().findOne(ctx.params.documentId);

      assertCan(ctx, CM_ACTIONS.create, current.contentType);

      const updated = await service().addVariant(ctx.params.documentId);

      metrics().sendDidAddVariant(updated);
      ctx.body = { data: updated };
    },

    /** Called by the admin panel once an editor has agreed to leave a variant they never changed. */
    async discardUnchangedVariant(ctx: Context) {
      const current = await service().findOne(ctx.params.documentId);

      assertCan(ctx, CM_ACTIONS.delete, current.contentType);

      const result = await service().discardUnchangedVariant(ctx.params.documentId, ctx.params.key);

      if (result.discarded) {
        metrics().sendDidDiscardVariant(result.experimentDeleted);
      }

      ctx.body = { data: result };
    },

    async removeVariant(ctx: Context) {
      const mode = toDisposeMode(ctx.query.variants);
      const current = await service().findOne(ctx.params.documentId);

      if (mode === 'delete') {
        assertCan(ctx, CM_ACTIONS.delete, current.contentType);
      }

      const updated = await service().removeVariant(ctx.params.documentId, ctx.params.key, mode);

      metrics().sendDidRemoveVariant(mode);
      ctx.body = { data: updated };
    },
  };
};

export default experiment;
