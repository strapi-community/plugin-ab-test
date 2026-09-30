import { Button, Dialog, Flex, Typography } from '@strapi/design-system';
import { WarningCircle } from '@strapi/icons';

import type { DisposeMode } from '../types';
import { useT } from '../utils/useT';

interface DisposeDialogProps {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  onChoose: (mode: DisposeMode) => void | Promise<void>;
}

/**
 * Asks what to do with variant entries that are about to leave an experiment: they are real
 * entries, so the editor decides whether to lose them or keep them as unpublished drafts.
 */
const DisposeDialog = ({ open, title, description, onClose, onChoose }: DisposeDialogProps) => {
  const t = useT();

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Content>
        <Dialog.Header>{title}</Dialog.Header>
        <Dialog.Body icon={<WarningCircle fill="danger600" />}>
          <Flex direction="column" gap={2}>
            <Typography textAlign="center">{description}</Typography>
            <Typography textAlign="center" textColor="neutral600" variant="pi">
              {t(
                'dispose.hint',
                'Kept variants become ordinary unpublished entries in the Content Manager.'
              )}
            </Typography>
          </Flex>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Cancel>
            <Button variant="tertiary">{t('action.cancel', 'Cancel')}</Button>
          </Dialog.Cancel>
          <Button variant="secondary" onClick={() => onChoose('keep')}>
            {t('dispose.keep', 'Keep variants')}
          </Button>
          <Button variant="danger-light" onClick={() => onChoose('delete')}>
            {t('dispose.delete', 'Delete variants')}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export { DisposeDialog };
