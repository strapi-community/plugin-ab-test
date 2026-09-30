import type { Core, Struct } from '@strapi/strapi';

import { LABEL_KEY, SEED_PARAM, VARIANT_PARAM } from './constants';
import { isEligible } from './utils';

const ASSIGNMENT_TYPE = 'AbTestAssignment';

// The GraphQL plugin hands extensions an untyped Nexus instance.
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Exposes the same `abSeed` / `abVariant` inputs and `abTest` label as the REST API. Queries reach
 * the document service like REST requests do, so serving a variant needs nothing else here.
 */
export const registerGraphql = ({ strapi }: { strapi: Core.Strapi }) => {
  const graphql = strapi.plugin('graphql');

  if (!graphql) {
    return;
  }

  const contentTypes = Object.values(
    strapi.contentTypes as Record<string, Struct.ContentTypeSchema>
  ).filter(isEligible);

  if (contentTypes.length === 0) {
    return;
  }

  const eligible = new Set<string>(contentTypes.map((contentType) => contentType.uid));
  const { naming } = graphql.service('utils');

  graphql.service('extension').use(({ nexus, typeRegistry }: any) => {
    const assignment = nexus.objectType({
      name: ASSIGNMENT_TYPE,
      description: 'The A/B test version served for this entry',
      definition(t: any) {
        t.nonNull.string('experiment');
        t.nonNull.string('variant');
        t.boolean('fallback');
      },
    });

    const labels = contentTypes.map((contentType) =>
      nexus.extendType({
        type: naming.getTypeName(contentType),
        definition(t: any) {
          t.field(LABEL_KEY, { type: ASSIGNMENT_TYPE });
        },
      })
    );

    const args = nexus.plugin({
      name: 'AbTestArgs',

      onAddOutputField(config: any) {
        if (config.parentType !== 'Query') {
          return;
        }

        const contentType =
          config?.extensions?.strapi?.contentType ??
          typeRegistry.get(config.type)?.config?.contentType;

        if (!contentType || !eligible.has(contentType.uid)) {
          return;
        }

        config.args = {
          ...config.args,
          [SEED_PARAM]: nexus.arg({
            type: 'String',
            description: 'Stable visitor identifier used to assign an A/B test variant',
          }),
          [VARIANT_PARAM]: nexus.arg({
            type: 'String',
            description: 'Force a given A/B test variant',
          }),
        };
      },
    });

    return { types: [assignment, ...labels], plugins: [args] };
  });
};
