import {
  Box,
  EmptyStateLayout,
  Flex,
  Link,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Typography,
} from '@strapi/design-system';
import { Layouts, Page, useRBAC } from '@strapi/strapi/admin';
import { useIntl } from 'react-intl';
import { NavLink, useNavigate } from 'react-router-dom';

import { getContentTypeInfo, useExperiments } from '../api';
import { ExperimentSettingsButton } from '../components/ExperimentSettingsButton';
import { StatusBadge } from '../components/StatusBadge';
import { CONTROL_KEY, PERMISSIONS } from '../constants';
import type { Experiment } from '../types';
import { editPath, splitSummary, variantName } from '../utils/labels';
import { timeLeft } from '../utils/time';
import { useT } from '../utils/useT';

/** Time left before the scheduled end, when the experiment has one and is not over already. */
const EndsIn = ({ experiment }: { experiment: Experiment }) => {
  const t = useT();
  const { formatDate, formatNumber } = useIntl();

  if (!experiment.endAt || experiment.status === 'completed') {
    return <Typography textColor="neutral500">-</Typography>;
  }

  const left = timeLeft(experiment.endAt);
  const exactDate = formatDate(experiment.endAt, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <Typography title={exactDate}>
      {left
        ? formatNumber(left.value, { style: 'unit', unit: left.unit, unitDisplay: 'long' })
        : t('page.ended', 'Ended')}
    </Typography>
  );
};

const ExperimentRow = ({
  experiment,
  canManage,
}: {
  experiment: Experiment;
  canManage: boolean;
}) => {
  const t = useT();
  const navigate = useNavigate();

  return (
    <Tr>
      <Td>
        <Flex direction="column" alignItems="flex-start" gap={1}>
          <Typography fontWeight="bold">{experiment.name}</Typography>
          <Link tag={NavLink} to={editPath(experiment.contentType, experiment.controlDocumentId)}>
            {t('page.open-entry', 'Open the entry')}
          </Link>
        </Flex>
      </Td>
      <Td>
        <Typography>
          {getContentTypeInfo(experiment.contentType)?.displayName ?? experiment.contentType}
        </Typography>
      </Td>
      <Td>
        <StatusBadge status={experiment.status} />
      </Td>
      <Td>
        <Typography>
          {experiment.status === 'completed'
            ? t('page.winner', 'Winner: {version}', {
                version: variantName(experiment.winner ?? CONTROL_KEY),
              })
            : splitSummary(experiment)}
        </Typography>
      </Td>
      <Td>
        <EndsIn experiment={experiment} />
      </Td>
      <Td>
        <ExperimentSettingsButton
          experiment={experiment}
          canManage={canManage}
          onVariantAdded={(documentId) => navigate(editPath(experiment.contentType, documentId))}
        />
      </Td>
    </Tr>
  );
};

const ExperimentsPage = () => {
  const t = useT();
  const { data, isLoading } = useExperiments();
  const { allowedActions } = useRBAC({ manage: PERMISSIONS.manage });
  const title = t('page.title', 'A/B Testing');

  if (isLoading) {
    return <Page.Loading />;
  }

  return (
    <Page.Main>
      <Page.Title>{title}</Page.Title>
      <Layouts.Header
        title={title}
        subtitle={t(
          'page.subtitle',
          'Experiments are created from an entry in the Content Manager, with "Create a variant".'
        )}
      />
      <Layouts.Content>
        <Flex direction="column" alignItems="stretch" gap={6}>
          {data.length === 0 ? (
            <Box background="neutral0" hasRadius shadow="tableShadow">
              <EmptyStateLayout
                content={t(
                  'page.empty',
                  'No experiment yet. Enable a content type in Settings → A/B Testing, then open an entry and create a variant.'
                )}
              />
            </Box>
          ) : (
            <Table colCount={6} rowCount={data.length + 1}>
              <Thead>
                <Tr>
                  <Th>
                    <Typography variant="sigma">{t('page.column.name', 'Experiment')}</Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">{t('page.column.type', 'Content type')}</Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">{t('page.column.status', 'Status')}</Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">
                      {t('page.column.split', 'Traffic split')}
                    </Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">{t('page.column.ends-in', 'Ends in')}</Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">{t('page.column.actions', 'Actions')}</Typography>
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.map((experiment) => (
                  <ExperimentRow
                    key={experiment.documentId}
                    experiment={experiment}
                    canManage={allowedActions.canManage === true}
                  />
                ))}
              </Tbody>
            </Table>
          )}
        </Flex>
      </Layouts.Content>
    </Page.Main>
  );
};

export { ExperimentsPage };
