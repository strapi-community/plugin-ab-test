import * as React from 'react';

import {
  Button,
  Dialog,
  Field,
  Flex,
  SingleSelect,
  SingleSelectOption,
  Typography,
} from '@strapi/design-system';

import { CONTROL_KEY } from '../constants';
import type { Experiment } from '../types';
import { variantName } from '../utils/labels';
import { useT } from '../utils/useT';

interface CompleteDialogProps {
  experiment: Experiment;
  open: boolean;
  onClose: () => void;
  onConfirm: (winner: string) => void | Promise<void>;
}

const CompleteDialog = ({ experiment, open, onClose, onConfirm }: CompleteDialogProps) => {
  const t = useT();
  const [winner, setWinner] = React.useState(CONTROL_KEY);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Content>
        <Dialog.Header>{t('complete.title', 'Complete the experiment')}</Dialog.Header>
        <Dialog.Body>
          <Flex direction="column" alignItems="stretch" gap={4} width="100%">
            <Typography>
              {t(
                'complete.description',
                'The winner is served to every visitor from now on. Choosing the original ends the test without changing what is served.'
              )}
            </Typography>
            <Field.Root name="winner">
              <Field.Label>{t('complete.winner', 'Winner')}</Field.Label>
              <SingleSelect value={winner} onChange={(value) => setWinner(String(value))}>
                <SingleSelectOption value={CONTROL_KEY}>
                  {variantName(CONTROL_KEY)}
                </SingleSelectOption>
                {experiment.variants.map((variant) => (
                  <SingleSelectOption key={variant.key} value={variant.key}>
                    {variantName(variant.key)}
                  </SingleSelectOption>
                ))}
              </SingleSelect>
            </Field.Root>
          </Flex>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Cancel>
            <Button variant="tertiary">{t('action.cancel', 'Cancel')}</Button>
          </Dialog.Cancel>
          <Button onClick={() => onConfirm(winner)}>{t('complete.confirm', 'Complete')}</Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export { CompleteDialog };
