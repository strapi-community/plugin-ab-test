import { Button, Flex, Table, Tbody, Td, Th, Thead, Tr, Typography } from '@strapi/design-system';
import { ArrowClockwise } from '@strapi/icons';
import { useIntl } from 'react-intl';

import { CONTROL_KEY } from '../constants';
import type { Experiment, Goal, Results, VersionResult } from '../types';
import { variantName } from '../utils/labels';
import { useT } from '../utils/useT';

interface ExperimentResultsProps {
  experiment: Experiment;
  results: Results | null;
  isLoading: boolean;
  onRefresh: () => void;
}

/** From this significance on, a difference with the original is treated as reliable. */
const RELIABLE = 0.95;

/** One row per version: what was measured, and how it compares with the original. */
const ResultsTable = ({ goal, versions }: { goal: Goal; versions: VersionResult[] }) => {
  const t = useT();
  const { formatNumber } = useIntl();
  const isConversion = goal.type === 'conversion';

  const percent = (value: number, signed = false) =>
    formatNumber(value, {
      style: 'percent',
      maximumFractionDigits: 1,
      signDisplay: signed ? 'exceptZero' : 'auto',
    });

  return (
    <Table colCount={6} rowCount={versions.length + 1}>
      <Thead>
        <Tr>
          <Th>
            <Typography variant="sigma">{t('results.column.version', 'Version')}</Typography>
          </Th>
          <Th>
            <Typography variant="sigma">{t('results.column.visitors', 'Visitors')}</Typography>
          </Th>
          <Th>
            <Typography variant="sigma">
              {isConversion
                ? t('results.column.conversions', 'Conversions')
                : t('results.column.pageviews', 'Page views')}
            </Typography>
          </Th>
          <Th>
            <Typography variant="sigma">
              {isConversion
                ? t('results.column.rate', 'Conversion rate')
                : t('results.column.per-visitor', 'Per visitor')}
            </Typography>
          </Th>
          <Th>
            <Typography variant="sigma">{t('results.column.uplift', 'Vs. original')}</Typography>
          </Th>
          <Th>
            <Typography variant="sigma">
              {t('results.column.significance', 'Significance')}
            </Typography>
          </Th>
        </Tr>
      </Thead>
      <Tbody>
        {versions.map((version) => {
          const isControl = version.key === CONTROL_KEY;
          const isReliable = (version.significance ?? 0) >= RELIABLE;

          return (
            <Tr key={version.key}>
              <Td>
                <Typography fontWeight="bold">{variantName(version.key)}</Typography>
              </Td>
              <Td>
                <Typography>{formatNumber(version.visitors)}</Typography>
              </Td>
              <Td>
                <Typography>{formatNumber(version.count)}</Typography>
              </Td>
              <Td>
                <Typography>
                  {version.value === null
                    ? '-'
                    : isConversion
                      ? percent(version.value)
                      : formatNumber(version.value, { maximumFractionDigits: 2 })}
                </Typography>
              </Td>
              <Td>
                <Typography>
                  {version.uplift === null ? '-' : percent(version.uplift, true)}
                </Typography>
              </Td>
              <Td>
                {isControl ? (
                  <Typography>-</Typography>
                ) : version.significance === null ? (
                  <Typography textColor="neutral600">
                    {t('results.significance.low', 'Not enough data')}
                  </Typography>
                ) : (
                  <Typography
                    fontWeight={isReliable ? 'bold' : undefined}
                    textColor={isReliable ? 'success600' : undefined}
                  >
                    {percent(version.significance)}
                  </Typography>
                )}
              </Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
  );
};

/**
 * What PostHog measured for each version, on the success metric of the experiment. Renders
 * nothing when no PostHog project is connected: results are an optional part of the plugin.
 */
const ExperimentResults = ({
  experiment,
  results,
  isLoading,
  onRefresh,
}: ExperimentResultsProps) => {
  const t = useT();
  const { formatTime } = useIntl();

  if (!results?.connected) {
    return null;
  }

  const { goal, versions, error, fetchedAt } = results;
  const hasVisitors = versions.some((version) => version.visitors > 0);

  const message = (() => {
    if (error) {
      return null;
    }

    if (!goal) {
      return t(
        'results.no-goal',
        'Set a success metric below and save: PostHog results are read for that metric.'
      );
    }

    if (experiment.status === 'draft') {
      return t('results.draft', 'Results appear here once the experiment has started.');
    }

    if (!hasVisitors && !isLoading) {
      return t(
        'results.empty',
        'PostHog has no exposure for this experiment yet. Your frontend must send the ab_test_exposure event with the experiment and variant properties: see Settings → A/B Testing.'
      );
    }

    return null;
  })();

  return (
    <Flex direction="column" alignItems="stretch" gap={3}>
      <Flex justifyContent="space-between" alignItems="center" gap={3}>
        <Typography variant="delta" tag="h3">
          {t('results.title', 'Results from PostHog')}
        </Typography>
        {goal && experiment.status !== 'draft' ? (
          <Button
            variant="tertiary"
            size="S"
            startIcon={<ArrowClockwise />}
            loading={isLoading}
            onClick={onRefresh}
          >
            {t('results.refresh', 'Refresh')}
          </Button>
        ) : null}
      </Flex>

      {error ? (
        <Typography textColor="danger600">
          {t('results.error', 'Results could not be read. {reason}', { reason: error })}
        </Typography>
      ) : null}

      {message ? <Typography textColor="neutral600">{message}</Typography> : null}

      {goal && !error && !message && hasVisitors ? (
        <>
          <ResultsTable goal={goal} versions={versions} />
          <Typography variant="pi" textColor="neutral600">
            {t(
              'results.note',
              'Read from PostHog at {time}. A visitor counts once, for the first version seen, and only for what happened after seeing it. Treat a difference as reliable from 95% significance.',
              { time: fetchedAt ? formatTime(fetchedAt) : '' }
            )}
          </Typography>
        </>
      ) : null}
    </Flex>
  );
};

export { ExperimentResults, ResultsTable };
