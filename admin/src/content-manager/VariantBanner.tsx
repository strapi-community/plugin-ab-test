import * as React from 'react';

import { Box, Button, Flex, Typography } from '@strapi/design-system';
import { createPortal } from 'react-dom';
import { styled } from 'styled-components';

import type { Experiment } from '../types';
import { variantName } from '../utils/labels';
import { useT } from '../utils/useT';

const Strip = styled(Flex)`
  background: ${({ theme }) => theme.colors.primary100};
  border-bottom: 1px solid ${({ theme }) => theme.colors.primary200};
  padding: ${({ theme }) => `${theme.spaces[3]} ${theme.spaces[4]}`};

  /* Lines up with the title and form below, which the edit view indents on large screens. */
  ${({ theme }) => theme.breakpoints.large} {
    padding: ${({ theme }) => `${theme.spaces[3]} ${theme.spaces[10]}`};
  }
`;

const Pill = styled(Box)`
  flex-shrink: 0;
  padding: ${({ theme }) => `${theme.spaces[1]} ${theme.spaces[2]}`};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.primary600};
`;

const ROOT_ATTRIBUTE = 'data-ab-test-banner-root';

interface VariantBannerProps {
  experiment: Experiment;
  variantKey: string;
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
const VariantBanner = ({ experiment, variantKey, onOpenOriginal }: VariantBannerProps) => {
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
            <Strip role="status" alignItems="center" gap={3} wrap="wrap" data-ab-test-banner>
              <Pill>
                <Typography variant="sigma" textColor="neutral0">
                  {variantName(variantKey)}
                </Typography>
              </Pill>
              <Typography textColor="primary700" style={{ flex: 1, minWidth: '16rem' }}>
                <Typography fontWeight="bold" textColor="primary700">
                  {t('banner.title', 'You are editing a variant of this entry.')}
                </Typography>{' '}
                {consequence}
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

export { VariantBanner };
