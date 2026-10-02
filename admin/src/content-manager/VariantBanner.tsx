import * as React from 'react';

import { Box, Button, Flex, Typography } from '@strapi/design-system';
import { createPortal } from 'react-dom';
import { styled } from 'styled-components';

import { getContentTypeInfo } from '../api';
import type { Experiment } from '../types';
import { variantName } from '../utils/labels';
import { useT } from '../utils/useT';

type Tone = 'primary' | 'warning';

const Strip = styled(Flex)<{ $tone: Tone }>`
  background: ${({ theme, $tone }) => theme.colors[`${$tone}100`]};
  border-bottom: 1px solid ${({ theme, $tone }) => theme.colors[`${$tone}200`]};
  padding: ${({ theme }) => `${theme.spaces[3]} ${theme.spaces[4]}`};

  /* Lines up with the title and form below, which the edit view indents on large screens. */
  ${({ theme }) => theme.breakpoints.large} {
    padding: ${({ theme }) => `${theme.spaces[3]} ${theme.spaces[10]}`};
  }
`;

const Pill = styled(Box)<{ $tone: Tone }>`
  flex-shrink: 0;
  padding: ${({ theme }) => `${theme.spaces[1]} ${theme.spaces[2]}`};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme, $tone }) => theme.colors[`${$tone}600`]};
`;

const ROOT_ATTRIBUTE = 'data-ab-test-banner-root';

/**
 * Whether the open entry is held back from visitors: its content type has Draft & Publish and
 * the entry has no published version. Like the status in the edit view header, a draft counts
 * as published when the same locale has a published version.
 */
const isUnpublished = (
  model: string,
  entry?: Record<string, unknown>,
  meta?: { availableStatus?: Array<{ publishedAt?: unknown }> }
): boolean =>
  getContentTypeInfo(model)?.draftAndPublish === true &&
  entry?.status === 'draft' &&
  !(meta?.availableStatus ?? []).some((version) => Boolean(version.publishedAt));

interface VariantBannerProps {
  experiment: Experiment;
  variantKey: string;
  /** See `isUnpublished`. */
  isUnpublished: boolean;
  onOpenOriginal: () => void;
}

/**
 * A strip across the top of the edit view, shown only while a variant is open, so there is no
 * mistaking it for the original entry.
 *
 * The Content Manager gives plugins no slot above the entry title, so the strip is rendered
 * through a portal into a node placed at the top of the edit view's `main` element. That node
 * is located from wherever this component is rendered inside the edit view, and removed with it.
 */
const VariantBanner = ({
  experiment,
  variantKey,
  isUnpublished,
  onOpenOriginal,
}: VariantBannerProps) => {
  const t = useT();
  const anchor = React.useRef<HTMLSpanElement>(null);
  const [container, setContainer] = React.useState<HTMLElement | null>(null);

  React.useLayoutEffect(() => {
    const main = anchor.current?.closest('main');

    if (!main) {
      return undefined;
    }

    // The edit view renders its header a second time, pinned, once the page is scrolled.
    if (main.querySelector(`:scope > [${ROOT_ATTRIBUTE}]`)) {
      return undefined;
    }

    const node = document.createElement('div');
    node.setAttribute(ROOT_ATTRIBUTE, '');
    main.prepend(node);
    setContainer(node);

    return () => node.remove();
  }, []);

  const isWinner = experiment.winner === variantKey;

  // Visitors only ever get published content, so this matters more than the experiment status,
  // unless the experiment is over and would not serve the variant anyway.
  const isHeldBack = isUnpublished && (experiment.status !== 'completed' || isWinner);
  const tone: Tone = isHeldBack ? 'warning' : 'primary';

  const unpublished = getContentTypeInfo(experiment.contentType)?.localized
    ? t(
        'banner.unpublished.locale',
        'It is not published in this locale, so visitors keep seeing the original there. Publish it to have it served.'
      )
    : t(
        'banner.unpublished',
        'It is not published, so visitors keep seeing the original. Publish it to have it served.'
      );

  // Say what the variant means for visitors right now, which depends on the experiment.
  const consequence = {
    draft: t(
      'banner.draft',
      'Once the experiment starts, part of your visitors see it instead of the original.'
    ),
    paused: t(
      'banner.paused',
      'The experiment is paused: visitors see the original until it resumes.'
    ),
    running: t('banner.running', 'Part of your visitors currently see it instead of the original.'),
    completed: isWinner
      ? t('banner.winner', 'It won the experiment and is served to every visitor.')
      : t('banner.completed', 'The experiment is complete and it is no longer served.'),
  }[experiment.status];

  return (
    <>
      <span ref={anchor} hidden />
      {container
        ? createPortal(
            <Strip
              role="status"
              alignItems="center"
              gap={3}
              wrap="wrap"
              $tone={tone}
              data-ab-test-banner
            >
              <Pill $tone={tone}>
                <Typography variant="sigma" textColor="neutral0">
                  {variantName(variantKey)}
                </Typography>
              </Pill>
              <Typography textColor={`${tone}700`} style={{ flex: 1, minWidth: '16rem' }}>
                <Typography fontWeight="bold" textColor={`${tone}700`}>
                  {t('banner.title', 'You are editing a variant of this entry.')}
                </Typography>{' '}
                {isHeldBack ? unpublished : consequence}
              </Typography>
              <Button variant="secondary" size="S" onClick={onOpenOriginal}>
                {t('banner.open-original', 'Go to the original')}
              </Button>
            </Strip>,
            container
          )
        : null}
    </>
  );
};

export { VariantBanner, isUnpublished };
