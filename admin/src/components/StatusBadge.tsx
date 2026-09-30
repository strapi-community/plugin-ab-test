import { Status, Typography } from '@strapi/design-system';

import type { ExperimentStatus } from '../types';
import { useT } from '../utils/useT';

const VARIANTS = {
  draft: 'neutral',
  running: 'success',
  paused: 'warning',
  completed: 'primary',
} as const;

const LABELS = {
  draft: 'Not started',
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
} as const;

const StatusBadge = ({ status }: { status: ExperimentStatus }) => {
  const t = useT();

  return (
    <Status variant={VARIANTS[status]} size="S" width="fit-content">
      <Typography tag="span" variant="omega" fontWeight="bold">
        {t(`status.${status}`, LABELS[status])}
      </Typography>
    </Status>
  );
};

export { StatusBadge };
