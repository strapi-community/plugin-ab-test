import { ACTIONS } from '../../constants';

const withPermission = (action: string) => ({
  policies: [
    'admin::isAuthenticatedAdmin',
    { name: 'admin::hasPermissions', config: { actions: [action] } },
  ],
});

// The edit view asks about every open document, so lookups only need an authenticated admin.
const authenticated = { policies: ['admin::isAuthenticatedAdmin'] };

export default () => ({
  type: 'admin',
  routes: [
    {
      method: 'GET',
      path: '/experiments',
      handler: 'experiment.find',
      config: withPermission(ACTIONS.read),
    },
    {
      method: 'GET',
      path: '/experiments/lookup',
      handler: 'experiment.lookup',
      config: authenticated,
    },
    {
      method: 'POST',
      path: '/experiments/lookup-many',
      handler: 'experiment.lookupMany',
      config: authenticated,
    },
    {
      method: 'GET',
      path: '/experiments/:documentId',
      handler: 'experiment.findOne',
      config: withPermission(ACTIONS.read),
    },
    {
      method: 'GET',
      path: '/experiments/:documentId/results',
      handler: 'experiment.results',
      config: withPermission(ACTIONS.read),
    },
    {
      method: 'POST',
      path: '/experiments',
      handler: 'experiment.create',
      config: withPermission(ACTIONS.manage),
    },
    {
      method: 'PUT',
      path: '/experiments/:documentId',
      handler: 'experiment.update',
      config: withPermission(ACTIONS.manage),
    },
    {
      method: 'POST',
      path: '/experiments/:documentId/actions/:action',
      handler: 'experiment.setStatus',
      config: withPermission(ACTIONS.manage),
    },
    {
      method: 'DELETE',
      path: '/experiments/:documentId',
      handler: 'experiment.delete',
      config: withPermission(ACTIONS.manage),
    },
    {
      method: 'GET',
      path: '/experiments/:documentId/unchanged-variants',
      handler: 'experiment.unchangedVariants',
      config: withPermission(ACTIONS.manage),
    },
    {
      method: 'POST',
      path: '/experiments/:documentId/variants',
      handler: 'experiment.addVariant',
      config: withPermission(ACTIONS.manage),
    },
    {
      method: 'POST',
      path: '/experiments/:documentId/variants/:key/discard-unchanged',
      handler: 'experiment.discardUnchangedVariant',
      config: withPermission(ACTIONS.manage),
    },
    {
      method: 'DELETE',
      path: '/experiments/:documentId/variants/:key',
      handler: 'experiment.removeVariant',
      config: withPermission(ACTIONS.manage),
    },
    {
      method: 'GET',
      path: '/content-types',
      handler: 'settings.contentTypes',
      config: authenticated,
    },
    {
      method: 'GET',
      path: '/settings',
      handler: 'settings.get',
      config: withPermission(ACTIONS.settings),
    },
    {
      method: 'PUT',
      path: '/settings',
      handler: 'settings.update',
      config: withPermission(ACTIONS.settings),
    },
    {
      method: 'PUT',
      path: '/posthog',
      handler: 'settings.connectPosthog',
      config: withPermission(ACTIONS.settings),
    },
    {
      method: 'DELETE',
      path: '/posthog',
      handler: 'settings.disconnectPosthog',
      config: withPermission(ACTIONS.settings),
    },
    {
      method: 'POST',
      path: '/uninstall/prepare',
      handler: 'settings.prepareUninstall',
      config: withPermission(ACTIONS.settings),
    },
  ],
});
