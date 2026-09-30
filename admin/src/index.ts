import { Initializer } from './components/Initializer';
import { PluginIcon } from './components/PluginIcon';
import { PERMISSIONS } from './constants';
import { ABTestPanel } from './content-manager/ABTestPanel';
import { addColumnToTableHook } from './content-manager/listView';
import { VariantPickerAction } from './content-manager/VariantPickerAction';
import { PLUGIN_ID } from './pluginId';
import { getTranslation } from './utils/getTranslation';

import type { ContentManagerPlugin } from '@strapi/content-manager/strapi-admin';
import type { StrapiApp } from '@strapi/strapi/admin';

const plugin: StrapiApp['appPlugins'][string] = {
  register(app) {
    app.addMenuLink({
      to: `plugins/${PLUGIN_ID}`,
      icon: PluginIcon,
      intlLabel: {
        id: getTranslation('plugin.name'),
        defaultMessage: 'A/B Testing',
      },
      Component: () => import('./pages/App'),
      permissions: PERMISSIONS.read,
    });

    app.registerPlugin({
      id: PLUGIN_ID,
      initializer: Initializer,
      isReady: false,
      name: PLUGIN_ID,
    });
  },

  bootstrap(app) {
    app.addSettingsLink('global', {
      intlLabel: {
        id: getTranslation('plugin.name'),
        defaultMessage: 'A/B Testing',
      },
      id: PLUGIN_ID,
      to: PLUGIN_ID,
      Component: () => import('./pages/SettingsPage'),
      permissions: PERMISSIONS.settings,
    });

    const contentManager = app.getPlugin('content-manager')
      .apis as ContentManagerPlugin['config']['apis'];

    contentManager.addDocumentHeaderAction([VariantPickerAction]);
    contentManager.addEditViewSidePanel([ABTestPanel]);

    app.registerHook('Admin/CM/pages/ListView/inject-column-in-table', addColumnToTableHook);
  },

  registerTrads({ locales }) {
    return Promise.all(
      locales.map(async (locale) => {
        try {
          const { default: data } = (await import(`./translations/${locale}.json`)) as {
            default: Record<string, string>;
          };

          return {
            data: Object.fromEntries(
              Object.entries(data).map(([key, value]) => [getTranslation(key), value])
            ),
            locale,
          };
        } catch {
          return { data: {}, locale };
        }
      })
    );
  },
};

export default plugin;
