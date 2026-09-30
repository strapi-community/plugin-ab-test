import { randomBytes } from 'node:crypto';

import type { Core, UID } from '@strapi/strapi';
import { errors } from '@strapi/utils';

import type { DisposeMode, Variant } from '../types';
import { getContentType, hasDraftAndPublish, isLocalized } from '../utils';
import {
  buildPopulate,
  contentKey,
  uniqueSuffix,
  type GetComponent,
  type Model,
} from '../utils/compare';
import { runInternal } from '../utils/internal';

const SUFFIXABLE_TYPES = new Set(['string', 'text']);

const variants = ({ strapi }: { strapi: Core.Strapi }) => {
  const requireContentType = (uid: string) => {
    const contentType = getContentType(strapi, uid);

    if (!contentType) {
      throw new errors.NotFoundError(`Content type ${uid} does not exist.`);
    }

    return contentType;
  };

  /**
   * A clone carries the source values, which fails validation on unique fields. Give those
   * fields a distinct value; the control's uid is restored when a variant is served.
   */
  const uniqueOverrides = async (uid: string, documentId: string, key: string) => {
    const contentType = requireContentType(uid);
    const token = randomBytes(2).toString('hex');

    const uniqueFields = Object.entries(contentType.attributes).filter(
      ([, attribute]) => attribute.type === 'uid' || (attribute as { unique?: boolean }).unique
    );

    if (uniqueFields.length === 0) {
      return {};
    }

    const unsupported = uniqueFields
      .filter(([, attribute]) => attribute.type !== 'uid' && !SUFFIXABLE_TYPES.has(attribute.type))
      .map(([name]) => name);

    if (unsupported.length > 0) {
      throw new errors.ValidationError(
        `Variants cannot be created for this content type because these unique fields cannot be duplicated: ${unsupported.join(', ')}`
      );
    }

    const source = await strapi.db.query(uid).findOne({
      where: { documentId },
      select: uniqueFields.map(([name]) => name),
      orderBy: { publishedAt: 'asc' },
    });

    const overrides: Record<string, string> = {};

    for (const [name, attribute] of uniqueFields) {
      const value = source?.[name];

      if (typeof value !== 'string' || value === '') {
        continue;
      }

      overrides[name] =
        attribute.type === 'uid' ? `${value}-ab-${key}-${token}` : `${value}${uniqueSuffix(key)}`;
    }

    return overrides;
  };

  return {
    /**
     * Keys of the variants whose saved content is still the same as the original's, in every
     * locale they have. A variant like that tests nothing, so adding another one is refused
     * until it has been edited.
     */
    async findUnchanged(
      uid: string,
      controlDocumentId: string,
      candidates: Variant[]
    ): Promise<string[]> {
      if (candidates.length === 0) {
        return [];
      }

      const contentType = requireContentType(uid) as unknown as Model;
      const getComponent: GetComponent = (componentUid) =>
        (strapi.components as Record<string, unknown>)[componentUid] as Model | undefined;
      const schema = getContentType(strapi, uid);

      const rows = (await runInternal(() =>
        strapi.documents(uid as UID.ContentType).findMany({
          filters: {
            documentId: {
              $in: [controlDocumentId, ...candidates.map((variant) => variant.documentId)],
            },
          },
          populate: buildPopulate(contentType, getComponent),
          // Editors work on drafts; that is the content a new variant would be compared with.
          ...(schema && hasDraftAndPublish(schema) ? { status: 'draft' } : {}),
          ...(schema && isLocalized(schema) ? { locale: '*' } : {}),
        } as never)
      )) as Array<Record<string, unknown>>;

      const original = new Map<string, string>();

      for (const row of rows) {
        if (row.documentId === controlDocumentId) {
          original.set(String(row.locale ?? ''), contentKey(row, contentType, getComponent));
        }
      }

      return candidates
        .filter((variant) => {
          const own = rows.filter((row) => row.documentId === variant.documentId);

          return (
            own.length > 0 &&
            own.every(
              (row) =>
                original.get(String(row.locale ?? '')) ===
                contentKey(row, contentType, getComponent, uniqueSuffix(variant.key))
            )
          );
        })
        .map((variant) => variant.key);
    },

    /** Copies every locale of the control into a new draft document and returns its documentId. */
    async clone(uid: string, controlDocumentId: string, key: string): Promise<string> {
      const contentType = requireContentType(uid);
      const data = await uniqueOverrides(uid, controlDocumentId, key);

      const result = await runInternal(() =>
        strapi.documents(uid as UID.ContentType).clone({
          documentId: controlDocumentId,
          ...(isLocalized(contentType) ? { locale: '*' } : {}),
          data,
        } as never)
      );

      if (!result?.documentId) {
        throw new errors.ApplicationError('The entry could not be duplicated into a variant.');
      }

      return result.documentId;
    },

    /**
     * Removes a variant from circulation: deleted outright, or unpublished and left as an
     * ordinary draft entry. Types without Draft & Publish cannot be unpublished, so "keep"
     * leaves them as regular entries.
     */
    async dispose(uid: string, documentId: string, mode: DisposeMode): Promise<void> {
      const contentType = getContentType(strapi, uid);

      if (!contentType) {
        return;
      }

      const locale = isLocalized(contentType) ? { locale: '*' } : {};
      const documents = strapi.documents(uid as UID.ContentType);

      await runInternal(async () => {
        if (mode === 'delete') {
          await documents.delete({ documentId, ...locale } as never);
        } else if (hasDraftAndPublish(contentType)) {
          await documents.unpublish({ documentId, ...locale } as never);
        }
      });
    },
  };
};

export default variants;
