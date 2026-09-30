import * as React from 'react';

import { Button } from '@strapi/design-system';

import type { Experiment } from '../types';
import { useT } from '../utils/useT';

import { ExperimentModal } from './ExperimentModal';

interface ExperimentSettingsButtonProps {
  experiment: Experiment;
  canManage: boolean;
  /** Full width in the edit view card, compact in the experiments table. */
  fullWidth?: boolean;
  /** Called with the new variant's documentId so the caller can open it for editing. */
  onVariantAdded?: (documentId: string) => void;
  onDeleted?: () => void;
}

/**
 * The single entry point to an experiment from both the edit view card and the experiments
 * list: every action lives in the modal it opens.
 */
const ExperimentSettingsButton = ({
  experiment,
  canManage,
  fullWidth = false,
  onVariantAdded,
  onDeleted,
}: ExperimentSettingsButtonProps) => {
  const t = useT();
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <>
      <Button
        variant="secondary"
        size={fullWidth ? 'M' : 'S'}
        fullWidth={fullWidth}
        onClick={() => setIsOpen(true)}
      >
        {t('action.settings', 'Experiment settings')}
      </Button>

      {isOpen ? (
        <ExperimentModal
          experiment={experiment}
          canManage={canManage}
          onClose={() => setIsOpen(false)}
          onVariantAdded={onVariantAdded}
          onDeleted={onDeleted}
        />
      ) : null}
    </>
  );
};

export { ExperimentSettingsButton };
