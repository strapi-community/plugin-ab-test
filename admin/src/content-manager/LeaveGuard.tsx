import * as React from 'react';

import { Button, Dialog, Flex, Typography } from '@strapi/design-system';
import { WarningCircle } from '@strapi/icons';
import { useBlocker } from 'react-router-dom';

import { getContentTypeInfo, invalidate, useExperimentActions } from '../api';
import type { Experiment } from '../types';
import { variantName } from '../utils/labels';
import { useT } from '../utils/useT';

/** Sub-pages of the open document (history, preview) are still that document. */
const leavesDocument = (current: string, next: string) =>
  next !== current && !next.startsWith(`${current}/`);

interface LeaveGuardProps {
  experiment: Experiment;
  variantKey: string;
}

/**
 * Creating a variant saves a copy of the entry straight away, so the editor can work on it in
 * the regular edit view. A copy left without any saved change tests nothing: it is deleted when
 * the editor leaves it, and the experiment with it if it was the only variant. This holds the
 * navigation until the editor has agreed to that, and nothing is deleted otherwise.
 *
 * React Router only consults the blocker registered last, and the edit view registers its own
 * for unsaved changes. Render this once the page has loaded, so it comes last, and only while
 * the form has nothing unsaved, so the edit view's blocker keeps doing its job.
 */
const LeaveGuard = ({ experiment, variantKey }: LeaveGuardProps) => {
  const t = useT();
  const actions = useExperimentActions();
  const [isConfirming, setIsConfirming] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    leavesDocument(currentLocation.pathname, nextLocation.pathname)
  );
  const latest = React.useRef(blocker);
  latest.current = blocker;

  const isBlocked = blocker.state === 'blocked';

  React.useEffect(() => {
    if (!isBlocked) {
      setIsConfirming(false);
      return undefined;
    }

    let cancelled = false;

    // The variant may have been saved or deleted since this page last asked.
    actions.findUnchangedVariants(experiment.documentId).then((unchanged) => {
      if (cancelled) {
        return;
      }

      if (unchanged.includes(variantKey)) {
        setIsConfirming(true);
      } else {
        latest.current.proceed?.();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isBlocked, actions, experiment.documentId, variantKey]);

  const handleConfirm = async () => {
    setIsDeleting(true);
    await actions.discardUnchangedVariant(experiment.documentId, variantKey);
    // In this order: refreshing the views unmounts this guard, and its blocker with it.
    blocker.proceed?.();
    invalidate();
  };

  const name = variantName(variantKey);

  return (
    <Dialog.Root
      open={isBlocked && isConfirming}
      onOpenChange={(next) => !next && !isDeleting && blocker.reset?.()}
    >
      <Dialog.Content>
        <Dialog.Header>{t('leave.title', 'Leave {name} unchanged?', { name })}</Dialog.Header>
        <Dialog.Body icon={<WarningCircle fill="danger600" />}>
          <Flex direction="column" gap={2}>
            <Typography textAlign="center">
              {experiment.variants.length === 1
                ? t(
                    'leave.description.experiment',
                    '{name} has no saved change. If you leave this page, it is deleted, and so is the experiment.',
                    { name }
                  )
                : t(
                    'leave.description.variant',
                    '{name} has no saved change. If you leave this page, it is deleted.',
                    { name }
                  )}
            </Typography>
            <Typography textAlign="center" textColor="neutral600" variant="pi">
              {getContentTypeInfo(experiment.contentType)?.draftAndPublish
                ? t(
                    'leave.hint.publish',
                    'To keep it, stay on this page, change something and save. Saving is enough to keep it, but visitors only get it once it is published.'
                  )
                : t('leave.hint', 'To keep it, stay on this page, change something and save.')}
            </Typography>
          </Flex>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Cancel>
            <Button variant="tertiary">{t('leave.stay', 'Stay on this page')}</Button>
          </Dialog.Cancel>
          <Button variant="danger-light" loading={isDeleting} onClick={handleConfirm}>
            {t('leave.confirm', 'Leave and delete')}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export { LeaveGuard };
