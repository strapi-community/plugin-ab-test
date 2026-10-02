import type { Core, Struct } from '@strapi/strapi';

import { PLUGIN_ID } from '../constants';
import type { Experiment, Variant } from '../types';
import type { Services } from '../services';

import { toGoal } from './goal';

export const getService = <TName extends keyof Services>(
  strapi: Core.Strapi,
  name: TName
): ReturnType<Services[TName]> => strapi.plugin(PLUGIN_ID).service(name);

export const getContentType = (
  strapi: Core.Strapi,
  uid: string
): Struct.ContentTypeSchema | undefined =>
  (strapi.contentTypes as Record<string, Struct.ContentTypeSchema>)[uid];

export const isLocalized = (contentType: Struct.ContentTypeSchema): boolean =>
  (contentType.pluginOptions as { i18n?: { localized?: boolean } } | undefined)?.i18n?.localized ===
  true;

export const hasDraftAndPublish = (contentType: Struct.ContentTypeSchema): boolean =>
  contentType.options?.draftAndPublish === true;

/** Only collection types defined by the application can be tested. */
export const isEligible = (contentType: Struct.ContentTypeSchema): boolean =>
  contentType.kind === 'collectionType' && contentType.uid.startsWith('api::');

const toVariants = (value: unknown): Variant[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Variant =>
          typeof item?.key === 'string' &&
          typeof item?.documentId === 'string' &&
          typeof item?.weight === 'number'
      )
    : [];

const toLocales = (value: unknown): string[] | null =>
  Array.isArray(value) && value.length > 0
    ? value.filter((item): item is string => typeof item === 'string')
    : null;

/** JSON columns come back untyped; this gives the rest of the plugin a reliable shape. */
export const normalizeExperiment = (row: Record<string, unknown>): Experiment => ({
  id: row.id as number,
  documentId: row.documentId as string,
  key: row.key as string,
  name: row.name as string,
  hypothesis: (row.hypothesis as string | null) ?? null,
  goal: toGoal(row.goal),
  contentType: row.contentType as string,
  controlDocumentId: row.controlDocumentId as string,
  variants: toVariants(row.variants),
  status: (row.status as Experiment['status']) ?? 'draft',
  startAt: row.startAt ? new Date(row.startAt as string).toISOString() : null,
  endAt: row.endAt ? new Date(row.endAt as string).toISOString() : null,
  locales: toLocales(row.locales),
  winner: (row.winner as string | null) ?? null,
  createdAt: row.createdAt ? new Date(row.createdAt as string).toISOString() : null,
});
