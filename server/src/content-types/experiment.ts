export default {
  schema: {
    kind: 'collectionType',
    collectionName: 'ab_test_experiments',
    info: {
      singularName: 'experiment',
      pluralName: 'experiments',
      displayName: 'A/B experiment',
    },
    options: {
      draftAndPublish: false,
    },
    pluginOptions: {
      'content-manager': { visible: false },
      'content-type-builder': { visible: false },
    },
    attributes: {
      key: { type: 'string', required: true, unique: true },
      name: { type: 'string', required: true },
      hypothesis: { type: 'text' },
      goal: { type: 'json' },
      contentType: { type: 'string', required: true },
      controlDocumentId: { type: 'string', required: true },
      variants: { type: 'json' },
      status: {
        type: 'enumeration',
        enum: ['draft', 'running', 'paused', 'completed'],
        default: 'draft',
        required: true,
      },
      startAt: { type: 'datetime' },
      endAt: { type: 'datetime' },
      locales: { type: 'json' },
      winner: { type: 'string' },
    },
  },
};
