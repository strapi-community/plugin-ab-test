import * as React from 'react';

import { Box, Button, Flex, Typography } from '@strapi/design-system';
import { Duplicate, Eye, EyeStriked } from '@strapi/icons';
import { useClipboard, useNotification } from '@strapi/strapi/admin';
import { styled } from 'styled-components';

import { useContentTypes, useExperiments } from '../api';
import type { PosthogConnection } from '../types';
import { buildFrontendPrompt } from '../utils/prompt';
import { useT } from '../utils/useT';

import { Snippet } from './HowItWorks';

// Prose, unlike code, has to wrap; and the prompt is long enough to scroll on its own.
const Prompt = styled(Snippet)`
  max-height: 48rem;
  overflow-y: auto;
  white-space: pre-wrap;
`;

/**
 * A prompt to paste into a coding assistant opened on the frontend's codebase. It asks for
 * `abSeed` on the requests for the enabled content types, then for an audit of what the
 * frontend reports to analytics. Written from the state of this project, so there is nothing
 * to fill in before pasting.
 */
const FrontendPrompt = ({ connection }: { connection: PosthogConnection | null }) => {
  const t = useT();
  const { copy } = useClipboard();
  const { toggleNotification } = useNotification();
  const contentTypes = useContentTypes();
  const experiments = useExperiments();
  const [isShown, setIsShown] = React.useState(false);

  const enabled = React.useMemo(() => contentTypes.filter((type) => type.enabled), [contentTypes]);

  const prompt = React.useMemo(
    () =>
      buildFrontendPrompt({
        contentTypes: enabled,
        experiments: experiments.data,
        posthog: connection?.connected ? connection : null,
      }),
    [enabled, experiments.data, connection]
  );

  const isReady = enabled.length > 0 && !experiments.isLoading && connection !== null;

  const handleCopy = async () => {
    const copied = await copy(prompt);

    toggleNotification(
      copied
        ? { type: 'success', message: t('prompt.copied', 'Prompt copied') }
        : {
            type: 'danger',
            message: t(
              'prompt.copy-failed',
              'The prompt could not be copied. Show it and copy it by hand.'
            ),
          }
    );
  };

  return (
    <Box background="neutral0" padding={6} hasRadius shadow="tableShadow">
      <Flex direction="column" alignItems="stretch" gap={4}>
        <Flex direction="column" alignItems="flex-start" gap={2}>
          <Typography variant="delta" tag="h2">
            {t('prompt.title', 'Set up your frontend with an AI assistant')}
          </Typography>
          <Typography textColor="neutral600">
            {t(
              'prompt.description',
              'A prompt to paste into a coding assistant opened on the codebase of your frontend. It asks it to send abSeed on the requests for the content types enabled on this page, then to audit what your frontend reports to analytics (PostHog, Amplitude, Google Analytics…): exposures, conversions, visitor identity, caching. It is written for this project: it lists your enabled content types, the success metrics of your experiments, and whether PostHog is connected.'
            )}
          </Typography>
        </Flex>

        <Flex gap={2} wrap="wrap">
          <Button startIcon={<Duplicate />} disabled={!isReady} onClick={handleCopy}>
            {t('prompt.copy', 'Copy prompt')}
          </Button>
          <Button
            variant="tertiary"
            startIcon={isShown ? <EyeStriked /> : <Eye />}
            disabled={!isReady}
            onClick={() => setIsShown((shown) => !shown)}
          >
            {isShown ? t('prompt.hide', 'Hide prompt') : t('prompt.show', 'Show prompt')}
          </Button>
        </Flex>

        {enabled.length === 0 ? (
          <Typography variant="pi" textColor="neutral600">
            {t(
              'prompt.no-content-type',
              'Enable a content type at the top of this page and save: the prompt is about the content types under test.'
            )}
          </Typography>
        ) : (
          <Typography variant="pi" textColor="neutral600">
            {t(
              'prompt.review',
              'The assistant is asked to show what it found and what it plans to change before editing. Review its changes like any other: it works on your code, and this page cannot see the result.'
            )}
          </Typography>
        )}

        {isShown && isReady ? <Prompt>{prompt}</Prompt> : null}
      </Flex>
    </Box>
  );
};

export { FrontendPrompt };
