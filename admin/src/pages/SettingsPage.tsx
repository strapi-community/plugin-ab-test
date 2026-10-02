import * as React from 'react';

import { Box, Button, Checkbox, Flex, Grid, Typography } from '@strapi/design-system';
import { Check } from '@strapi/icons';
import { Layouts, Page, useNotification } from '@strapi/strapi/admin';

import { useContentTypes, useExperimentActions, usePosthogConnection } from '../api';
import { DisposeDialog } from '../components/DisposeDialog';
import { HowItWorks } from '../components/HowItWorks';
import { PosthogResults } from '../components/PosthogResults';
import { PERMISSIONS } from '../constants';
import type { DisposeMode } from '../types';
import { useT } from '../utils/useT';

const SettingsPage = () => {
  const t = useT();
  const contentTypes = useContentTypes();
  const actions = useExperimentActions();
  const posthog = usePosthogConnection();
  const { toggleNotification } = useNotification();

  const saved = React.useMemo(
    () => contentTypes.filter((type) => type.enabled).map((type) => type.uid),
    [contentTypes]
  );
  const [selected, setSelected] = React.useState<string[]>(saved);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isUninstallOpen, setIsUninstallOpen] = React.useState(false);

  // Follow the server once a save or an uninstall clean-up changed what is enabled.
  React.useEffect(() => setSelected(saved), [saved]);

  const isDirty = selected.length !== saved.length || selected.some((uid) => !saved.includes(uid));
  const title = t('settings.title', 'A/B Testing');

  const toggle = (uid: string, checked: boolean) =>
    setSelected((current) =>
      checked ? [...current, uid] : current.filter((item) => item !== uid)
    );

  const handleSave = async () => {
    setIsSaving(true);
    const result = await actions.saveSettings(selected);
    setIsSaving(false);

    if (result) {
      toggleNotification({ type: 'success', message: t('settings.saved', 'Settings saved') });
    }
  };

  const handleUninstall = async (mode: DisposeMode) => {
    setIsUninstallOpen(false);
    const summary = await actions.prepareUninstall(mode);

    if (summary) {
      toggleNotification({
        type: 'success',
        message: t(
          'settings.uninstall.done',
          '{experiments} experiment(s) removed. The plugin can now be uninstalled.',
          { experiments: summary.experiments }
        ),
      });
    }
  };

  return (
    <Page.Main>
      <Page.Title>{title}</Page.Title>
      <Layouts.Header
        title={title}
        subtitle={t('settings.subtitle', 'Choose which content types can be A/B tested.')}
        primaryAction={
          <Button startIcon={<Check />} onClick={handleSave} loading={isSaving} disabled={!isDirty}>
            {t('action.save', 'Save')}
          </Button>
        }
      />
      <Layouts.Content>
        <Flex direction="column" alignItems="stretch" gap={6}>
          <Box background="neutral0" padding={6} hasRadius shadow="tableShadow">
            <Flex direction="column" alignItems="stretch" gap={4}>
              <Typography variant="delta" tag="h2">
                {t('settings.content-types', 'Content types')}
              </Typography>
              {contentTypes.length === 0 ? (
                <Typography textColor="neutral600">
                  {t(
                    'settings.content-types.empty',
                    'Create a collection type first: A/B testing works on collection types of your application.'
                  )}
                </Typography>
              ) : (
                contentTypes.map((type) => (
                  <Checkbox
                    key={type.uid}
                    checked={selected.includes(type.uid)}
                    onCheckedChange={(checked) => toggle(type.uid, checked === true)}
                  >
                    {type.displayName}
                  </Checkbox>
                ))
              )}
            </Flex>
          </Box>

          <Flex direction="column" alignItems="stretch" gap={3}>
            <Flex direction="column" alignItems="flex-start" gap={1}>
              <Typography variant="delta" tag="h2">
                {t('settings.integrations', 'Integrations')}
              </Typography>
              <Typography textColor="neutral600">
                {t(
                  'settings.integrations.hint',
                  'Optional. A/B testing works without them: connect one to see the results of your experiments in Strapi.'
                )}
              </Typography>
            </Flex>
            <Grid.Root gap={4}>
              <Grid.Item col={6} s={12} direction="column" alignItems="stretch">
                <PosthogResults connection={posthog} />
              </Grid.Item>
            </Grid.Root>
          </Flex>

          <Flex direction="column" alignItems="stretch" gap={3}>
            <Typography variant="delta" tag="h2">
              {t('settings.how-it-works', 'How it works')}
            </Typography>
            <HowItWorks />
          </Flex>

          <Box background="neutral0" padding={6} hasRadius shadow="tableShadow">
            <Flex direction="column" alignItems="flex-start" gap={4}>
              <Typography variant="delta" tag="h2">
                {t('settings.uninstall', 'Uninstalling the plugin')}
              </Typography>
              <Typography textColor="neutral600">
                {t(
                  'settings.uninstall.description',
                  'Variants are regular entries that the plugin keeps hidden. Removing the package without cleaning up would make published variants appear as separate entries. This removes every experiment and these settings first.'
                )}
              </Typography>
              <Button variant="danger-light" onClick={() => setIsUninstallOpen(true)}>
                {t('settings.uninstall.action', 'Prepare for uninstall')}
              </Button>
            </Flex>
          </Box>
        </Flex>
      </Layouts.Content>

      <DisposeDialog
        open={isUninstallOpen}
        title={t('settings.uninstall.title', 'Prepare for uninstall')}
        description={t(
          'settings.uninstall.confirm',
          'Every experiment is deleted and visitors get the original entries. What should happen to the variants?'
        )}
        onClose={() => setIsUninstallOpen(false)}
        onChoose={handleUninstall}
      />
    </Page.Main>
  );
};

const ProtectedSettingsPage = () => (
  <Page.Protect permissions={PERMISSIONS.settings}>
    <SettingsPage />
  </Page.Protect>
);

export default ProtectedSettingsPage;
