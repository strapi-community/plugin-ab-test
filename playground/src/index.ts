import type { Core } from '@strapi/strapi';

const PUBLIC_ACTIONS = [
  'api::article.article.find',
  'api::article.article.findOne',
  'api::page.page.find',
  'api::page.page.findOne',
];

export default {
  /**
   * Test helper: a request sent with `x-count-queries` gets the number of database queries it
   * caused back in `x-query-count`, so the e2e suite can assert what the plugin costs.
   */
  register({ strapi }: { strapi: Core.Strapi }) {
    strapi.server.use(async (ctx, next) => {
      // Lets the e2e suite make sure it is not about to wipe a database someone works in.
      const filename = strapi.config.get<string>('database.connection.connection.filename', '');
      ctx.set('x-playground-db', filename.split('/').pop() ?? '');

      if (!ctx.get('x-count-queries')) {
        return next();
      }

      let count = 0;
      const statements: string[] = [];
      const onQuery = (query: { sql: string }) => {
        statements.push(query.sql);

        // The document service wraps every call in a transaction; count the data queries only.
        if (!/^(begin|commit|rollback|savepoint|release)/i.test(query.sql)) {
          count += 1;
        }
      };

      strapi.db.connection.on('query', onQuery);

      try {
        await next();
      } finally {
        strapi.db.connection.off('query', onQuery);
        ctx.set('x-query-count', String(count));

        if (ctx.get('x-count-queries') === 'debug') {
          ctx.set('x-query-log', encodeURIComponent(statements.join(' ;; ')));
        }
      }
    });
  },

  /** Test fixtures: a second locale and public read access to the test content types. */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    const locales = strapi.plugin('i18n').service('locales');

    if (!(await locales.findByCode('fr'))) {
      await locales.create({ code: 'fr', name: 'French (fr)' });
    }

    const publicRole = await strapi.db
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: 'public' } });

    for (const action of PUBLIC_ACTIONS) {
      const existing = await strapi.db
        .query('plugin::users-permissions.permission')
        .findOne({ where: { action, role: publicRole.id } });

      if (!existing) {
        await strapi.db
          .query('plugin::users-permissions.permission')
          .create({ data: { action, role: publicRole.id } });
      }
    }
  },
};
