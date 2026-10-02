import * as React from 'react';

import {
  Button,
  Field,
  Flex,
  Grid,
  Modal,
  SingleSelect,
  SingleSelectOption,
  Status,
  TextInput,
  Typography,
} from '@strapi/design-system';
import { useNotification } from '@strapi/strapi/admin';
import { styled } from 'styled-components';

import { useExperimentActions } from '../api';
import type { Goal, PosthogConnection, VersionResult } from '../types';
import { useRichT, useT } from '../utils/useT';

import { ResultsTable } from './ExperimentResults';
import { MEASURE_EXAMPLE, Param, Point, Snippet } from './HowItWorks';
import { PosthogLogo } from './PosthogLogo';

const HOSTS = { us: 'https://us.posthog.com', eu: 'https://eu.posthog.com' } as const;

type Region = keyof typeof HOSTS | 'custom';

// Made-up numbers, to show what the experiment settings look like once results come in.
const EXAMPLE_GOAL: Goal = { type: 'conversion', event: 'form_submitted' };
const EXAMPLE_VERSIONS: VersionResult[] = [
  { key: 'control', visitors: 1000, count: 100, value: 0.1, uplift: null, significance: null },
  { key: 'b', visitors: 1000, count: 130, value: 0.13, uplift: 0.3, significance: 0.965 },
];

const regionOf = (host: string | null): Region => {
  if (!host || host === HOSTS.us) {
    return 'us';
  }

  return host === HOSTS.eu ? 'eu' : 'custom';
};

// The colour is set explicitly: a button does not inherit the text colour of the page, which
// changes with the theme.
const Card = styled.button`
  display: block;
  width: 100%;
  padding: ${({ theme }) => theme.spaces[5]};
  border: 1px solid ${({ theme }) => theme.colors.neutral150};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.neutral0};
  box-shadow: ${({ theme }) => theme.shadows.tableShadow};
  color: ${({ theme }) => theme.colors.neutral800};
  text-align: left;
  cursor: pointer;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary600};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary600};
    outline-offset: 2px;
  }
`;

// The logo has a near-black part, so its tile stays light in the dark theme too.
const LogoTile = styled.span`
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 6.4rem;
  height: 4.8rem;
  border: 1px solid ${({ theme }) => theme.colors.neutral200};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: #ffffff;
`;

const ConnectionStatus = ({ connected }: { connected: boolean }) => {
  const t = useT();

  return (
    <Status variant={connected ? 'success' : 'neutral'} size="S" width="fit-content">
      <Typography tag="span" variant="omega" fontWeight="bold">
        {connected
          ? t('posthog.connected', 'Connected')
          : t('posthog.not-connected', 'Not connected')}
      </Typography>
    </Status>
  );
};

/**
 * Where the PostHog project and key are pasted. The key goes to the server once, is checked
 * with PostHog, stored encrypted, and never comes back: only its ends are shown afterwards.
 */
const PosthogModal = ({
  connection,
  onClose,
}: {
  connection: PosthogConnection;
  onClose: () => void;
}) => {
  const t = useT();
  const rich = useRichT();
  const actions = useExperimentActions();
  const { toggleNotification } = useNotification();

  const [region, setRegion] = React.useState<Region>(regionOf(connection.host));
  const [customHost, setCustomHost] = React.useState(
    regionOf(connection.host) === 'custom' ? (connection.host ?? '') : ''
  );
  const [projectId, setProjectId] = React.useState(connection.projectId ?? '');
  const [personalApiKey, setPersonalApiKey] = React.useState('');
  const [busy, setBusy] = React.useState<'connect' | 'disconnect' | null>(null);

  const fromConfig = connection.source === 'config';
  const hasSavedKey = connection.source === 'settings';
  const host = region === 'custom' ? customHost.trim() : HOSTS[region];
  const canConnect =
    host !== '' && projectId.trim() !== '' && (personalApiKey.trim() !== '' || hasSavedKey);

  const handleConnect = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!canConnect || busy) {
      return;
    }

    setBusy('connect');
    const saved = await actions.connectPosthog({ host, projectId, personalApiKey });
    setBusy(null);

    if (saved) {
      setPersonalApiKey('');
      toggleNotification({
        type: 'success',
        message: t('posthog.saved', 'PostHog connected'),
      });
    }
  };

  const handleDisconnect = async () => {
    setBusy('disconnect');
    const cleared = await actions.disconnectPosthog();
    setBusy(null);

    if (cleared) {
      toggleNotification({
        type: 'success',
        message: t('posthog.disconnected', 'PostHog disconnected'),
      });
    }
  };

  return (
    <Modal.Root open onOpenChange={(next) => !next && onClose()}>
      <Modal.Content>
        <form onSubmit={handleConnect}>
          <Modal.Header>
            <Modal.Title>{t('posthog.title', 'Results from PostHog')}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Flex direction="column" alignItems="stretch" gap={6}>
              <Flex direction="column" alignItems="stretch" gap={4}>
                <Flex gap={4} alignItems="center">
                  <LogoTile>
                    <PosthogLogo />
                  </LogoTile>
                  <ConnectionStatus connected={connection.connected} />
                </Flex>
                <Typography textColor="neutral600">
                  {t(
                    'posthog.description',
                    'Optional. A/B testing works without it: your frontend reports to the analytics tool of your choice and you compare versions there. With a PostHog project connected, the plugin reads the results of each experiment from PostHog by itself and shows them in Experiment settings: visitors, conversions, difference with the original and significance, for the success metric of the experiment.'
                  )}
                </Typography>
              </Flex>

              <Flex direction="column" alignItems="stretch" gap={4}>
                <Typography variant="delta" tag="h3">
                  {t('posthog.form.title', 'Connection')}
                </Typography>

                {connection.connected ? (
                  <Typography>
                    {rich('posthog.project', 'Results are read from project {project} on {host}.', {
                      project: <Param>{connection.projectId}</Param>,
                      host: <Param>{connection.host}</Param>,
                    })}
                  </Typography>
                ) : null}

                {fromConfig ? (
                  <Typography textColor="neutral600">
                    {rich(
                      'posthog.from-config',
                      'This connection is set in {file}, which takes precedence over this page. Change it there.',
                      { file: <Param>config/plugins.ts</Param> }
                    )}
                  </Typography>
                ) : (
                  <>
                    <Grid.Root gap={4}>
                      <Grid.Item col={6} xs={12} direction="column" alignItems="stretch">
                        <Field.Root name="region">
                          <Field.Label>{t('posthog.form.region', 'PostHog region')}</Field.Label>
                          <SingleSelect
                            value={region}
                            onChange={(value) => setRegion(value as Region)}
                          >
                            <SingleSelectOption value="us">
                              {t('posthog.form.region.us', 'US Cloud (us.posthog.com)')}
                            </SingleSelectOption>
                            <SingleSelectOption value="eu">
                              {t('posthog.form.region.eu', 'EU Cloud (eu.posthog.com)')}
                            </SingleSelectOption>
                            <SingleSelectOption value="custom">
                              {t('posthog.form.region.custom', 'Self-hosted')}
                            </SingleSelectOption>
                          </SingleSelect>
                        </Field.Root>
                      </Grid.Item>
                      <Grid.Item col={6} xs={12} direction="column" alignItems="stretch">
                        <Field.Root
                          name="projectId"
                          required
                          hint={t(
                            'posthog.form.project.hint',
                            'The number in the address of your project: us.posthog.com/project/12345.'
                          )}
                        >
                          <Field.Label>{t('posthog.form.project', 'Project ID')}</Field.Label>
                          <TextInput
                            value={projectId}
                            placeholder="12345"
                            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                              setProjectId(event.target.value)
                            }
                          />
                          <Field.Hint />
                        </Field.Root>
                      </Grid.Item>
                    </Grid.Root>

                    {region === 'custom' ? (
                      <Field.Root name="host" required>
                        <Field.Label>{t('posthog.form.host', 'PostHog address')}</Field.Label>
                        <TextInput
                          value={customHost}
                          placeholder="https://posthog.example.com"
                          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                            setCustomHost(event.target.value)
                          }
                        />
                      </Field.Root>
                    ) : null}

                    <Field.Root
                      name="personalApiKey"
                      required={!hasSavedKey}
                      hint={
                        hasSavedKey
                          ? t(
                              'posthog.form.key.hint.saved',
                              'A key is saved ({hint}). Leave empty to keep it, or paste another one to replace it.',
                              { hint: connection.keyHint ?? '' }
                            )
                          : t(
                              'posthog.form.key.hint',
                              'It starts with phx_. Create it in PostHog, under Settings → Personal API keys, with the "Query Read" scope. The project token (phc_…) your frontend uses cannot read results.'
                            )
                      }
                    >
                      <Field.Label>{t('posthog.form.key', 'Personal API key')}</Field.Label>
                      <TextInput
                        type="password"
                        autoComplete="off"
                        value={personalApiKey}
                        placeholder="phx_…"
                        onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                          setPersonalApiKey(event.target.value)
                        }
                      />
                      <Field.Hint />
                    </Field.Root>

                    <Typography variant="pi" textColor="neutral600">
                      {t(
                        'posthog.form.note',
                        'The key is checked with PostHog when you connect, stored encrypted, and never shown again.'
                      )}
                    </Typography>
                  </>
                )}
              </Flex>

              <Flex direction="column" alignItems="stretch" gap={3}>
                <Typography variant="delta" tag="h3">
                  {t('posthog.example.heading', 'What you get in Experiment settings')}
                </Typography>
                <Typography textColor="neutral600">
                  {t(
                    'posthog.example.description',
                    'An example with made-up numbers, for an experiment whose success metric is a conversion. Each version gets its visitors, its conversions, the difference with the original and how reliable that difference is.'
                  )}
                </Typography>
                <ResultsTable goal={EXAMPLE_GOAL} versions={EXAMPLE_VERSIONS} />
              </Flex>

              <Flex direction="column" alignItems="stretch" gap={3}>
                <Typography variant="delta" tag="h3">
                  {t('posthog.convention.heading', 'What your frontend must send')}
                </Typography>
                <Typography fontWeight="bold">
                  {t(
                    'posthog.convention.title',
                    'Results only show up if your frontend follows this convention exactly:'
                  )}
                </Typography>
                <Point title={t('posthog.convention.exposure.title', 'One exposure event.')}>
                  {rich(
                    'posthog.convention.exposure',
                    'Named {event}, sent when a tested entry is displayed, with two properties taken from the {label} label of the entry: {experiment} and {variant}. Under any other name, or without these properties, the visitor is not counted.',
                    {
                      event: <Param>ab_test_exposure</Param>,
                      label: <Param>abTest</Param>,
                      experiment: <Param>experiment</Param>,
                      variant: <Param>variant</Param>,
                    }
                  )}
                </Point>
                <Point
                  title={t('posthog.convention.goal.title', 'The event of the success metric.')}
                >
                  {rich(
                    'posthog.convention.goal',
                    'A conversion is counted when PostHog receives an event with exactly the name typed in the success metric of the experiment. Page views are counted from the {pageview} events PostHog records.',
                    { pageview: <Param>$pageview</Param> }
                  )}
                </Point>
                <Point title={t('posthog.convention.visitor.title', 'The same visitor for both.')}>
                  {t(
                    'posthog.convention.visitor',
                    'PostHog links the exposure and what follows through the visitor, so send both with the same PostHog client. A visitor counts once, for the first version seen, and only for what happened after seeing it.'
                  )}
                </Point>
                <Typography fontWeight="bold">
                  {t('posthog.convention.example', 'An example that follows it:')}
                </Typography>
                <Snippet>{MEASURE_EXAMPLE}</Snippet>
              </Flex>
            </Flex>
          </Modal.Body>
          <Modal.Footer>
            <Modal.Close>
              <Button variant="tertiary" type="button">
                {t('posthog.close', 'Close')}
              </Button>
            </Modal.Close>
            {fromConfig ? null : (
              <Flex gap={2}>
                {hasSavedKey ? (
                  <Button
                    variant="danger-light"
                    type="button"
                    loading={busy === 'disconnect'}
                    onClick={handleDisconnect}
                  >
                    {t('posthog.disconnect', 'Disconnect')}
                  </Button>
                ) : null}
                <Button type="submit" loading={busy === 'connect'} disabled={!canConnect}>
                  {hasSavedKey ? t('posthog.save', 'Save') : t('posthog.connect', 'Connect')}
                </Button>
              </Flex>
            )}
          </Modal.Footer>
        </form>
      </Modal.Content>
    </Modal.Root>
  );
};

/**
 * The optional link to PostHog, as a card: its logo and whether it is connected. Opening it
 * shows where to paste the project and the key, and the convention a frontend must follow
 * for results to show up.
 */
const PosthogResults = ({ connection }: { connection: PosthogConnection | null }) => {
  const t = useT();
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <>
      <Card
        type="button"
        aria-haspopup="dialog"
        disabled={!connection}
        onClick={() => setIsOpen(true)}
      >
        <Flex gap={4} alignItems="center">
          <LogoTile>
            <PosthogLogo />
          </LogoTile>
          <Flex direction="column" alignItems="flex-start" gap={1} flex="1">
            <Typography fontWeight="bold" textColor="neutral800">
              PostHog
            </Typography>
            <Typography variant="pi" textColor="neutral600">
              {t('posthog.card', 'Shows the results of your experiments in Strapi.')}
            </Typography>
          </Flex>
          {connection ? <ConnectionStatus connected={connection.connected} /> : null}
        </Flex>
      </Card>

      {isOpen && connection ? (
        <PosthogModal connection={connection} onClose={() => setIsOpen(false)} />
      ) : null}
    </>
  );
};

export { PosthogResults };
