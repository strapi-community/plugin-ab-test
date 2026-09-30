import * as React from 'react';

import {
  Box,
  Button,
  Flex,
  Loader,
  SingleSelect,
  SingleSelectOption,
  Typography,
} from '@strapi/design-system';
import { useRBAC } from '@strapi/strapi/admin';
import { useLocation, useNavigate } from 'react-router-dom';
import { createGlobalStyle, styled } from 'styled-components';

import { isEnabledType, useExperimentActions, useLookup } from '../api';
import { CreateExperimentModal } from '../components/CreateExperimentModal';
import { ExperimentSettingsButton } from '../components/ExperimentSettingsButton';
import { StatusBadge } from '../components/StatusBadge';
import { CONTROL_KEY, PERMISSIONS } from '../constants';
import { editPath, splitSummary, variantName, versionTargets } from '../utils/labels';
import { useT } from '../utils/useT';

import { VariantBanner } from './VariantBanner';
import { useDiscardUntouchedOnLeave } from './useDiscardUntouchedOnLeave';

import type { PanelComponent } from '@strapi/content-manager/strapi-admin';

/**
 * The Content Manager owns the panel card and the plugin only renders what goes inside it.
 * `:has()` lets that content outline the card it sits in, in the colours of a secondary button,
 * so the entry being part of an A/B test stands out in the sidebar.
 */
const CardHighlight = createGlobalStyle`
  aside:has([data-ab-test-version]) {
    position: relative;

    ${({ theme }) => theme.breakpoints.large} {
      border-color: ${({ theme }) => theme.colors.primary200};
    }
  }
`;

/**
 * Sits on the card's title row, top right: it names the version open in the editor and switches
 * to the others. Tinted like the card's outline so it still reads as a label at a glance.
 */
const VersionPicker = styled(Box)`
  position: absolute;
  top: 0;
  right: 0;
  width: 13rem;

  ${({ theme }) => theme.breakpoints.large} {
    top: ${({ theme }) => theme.spaces[2]};
    right: ${({ theme }) => theme.spaces[4]};
  }

  [role='combobox'] {
    border-color: ${({ theme }) => theme.colors.primary200};
    background: ${({ theme }) => theme.colors.primary100};
  }

  [role='combobox'] span {
    color: ${({ theme }) => theme.colors.primary600};
    font-weight: ${({ theme }) => theme.fontWeights.bold};
  }

  [role='combobox'] svg path {
    fill: ${({ theme }) => theme.colors.primary600};
  }
`;

// Attributes that usually hold what an editor would call the entry, in order of preference.
const TITLE_FIELDS = ['title', 'name', 'label', 'heading', 'headline', 'subject'];

/** A starting point for the experiment name, taken from the entry when it has an obvious title. */
const suggestName = (entry?: Record<string, unknown>): string => {
  for (const field of TITLE_FIELDS) {
    const value = entry?.[field];

    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }

  return '';
};

interface PanelContentProps {
  model: string;
  documentId: string;
  suggestedName: string;
}

const PanelContent = ({ model, documentId, suggestedName }: PanelContentProps) => {
  const t = useT();
  const navigate = useNavigate();
  const { search } = useLocation();
  const actions = useExperimentActions();
  const { data, isLoading } = useLookup(model, documentId);
  const { allowedActions } = useRBAC({ manage: PERMISSIONS.manage });
  const [isCreating, setIsCreating] = React.useState(false);
  const [isNaming, setIsNaming] = React.useState(false);

  const canManage = allowedActions.canManage === true;
  const open = (target: string) => navigate(editPath(model, target, search));

  useDiscardUntouchedOnLeave(
    data?.experiment.documentId ?? '',
    data?.variantKey ?? '',
    data?.role === 'variant' && canManage
  );

  if (isLoading) {
    return <Loader small />;
  }

  if (!data) {
    const handleCreate = async (name: string) => {
      setIsCreating(true);
      const experiment = await actions.create(model, documentId, name);
      setIsCreating(false);

      if (experiment?.variants[0]) {
        setIsNaming(false);
        open(experiment.variants[0].documentId);
      }
    };

    return (
      <Flex direction="column" alignItems="stretch" gap={3} width="100%">
        <Typography textColor="neutral600">
          {t(
            'panel.empty',
            'Create a variant of this entry to test a different version with part of your visitors.'
          )}
        </Typography>
        <Button
          variant="secondary"
          fullWidth
          disabled={!canManage}
          onClick={() => setIsNaming(true)}
        >
          {t('panel.create', 'Create a variant')}
        </Button>

        {isNaming ? (
          <CreateExperimentModal
            suggestedName={suggestedName}
            isCreating={isCreating}
            onClose={() => setIsNaming(false)}
            onCreate={handleCreate}
          />
        ) : null}
      </Flex>
    );
  }

  const { experiment, variantKey, role } = data;
  const targets = versionTargets(experiment);

  // Variants are separate documents, so picking one opens it. The query string is kept so the
  // current locale carries over.
  const handleSelect = (value: string | number) => {
    const target = targets[String(value)];

    if (target && value !== variantKey) {
      open(target);
    }
  };

  return (
    <Flex direction="column" alignItems="stretch" gap={4} width="100%" data-ab-test-version>
      <CardHighlight />
      {role === 'variant' ? (
        <VariantBanner
          experiment={experiment}
          variantKey={variantKey}
          onOpenOriginal={() => open(experiment.controlDocumentId)}
        />
      ) : null}
      <VersionPicker>
        <SingleSelect
          size="S"
          aria-label={t('picker.label', 'A/B test version')}
          value={variantKey}
          onChange={handleSelect}
        >
          {Object.keys(targets).map((key) => (
            <SingleSelectOption key={key} value={key}>
              {variantName(key)}
            </SingleSelectOption>
          ))}
        </SingleSelect>
      </VersionPicker>

      <Flex direction="column" alignItems="flex-start" gap={2}>
        <StatusBadge status={experiment.status} />
        <Typography textColor="neutral600">
          {experiment.status === 'completed'
            ? t('panel.winner', 'Served to everyone: {version}', {
                version: variantName(experiment.winner ?? CONTROL_KEY),
              })
            : splitSummary(experiment)}
        </Typography>
      </Flex>

      <ExperimentSettingsButton
        experiment={experiment}
        canManage={canManage}
        fullWidth
        onVariantAdded={open}
        onDeleted={() => open(experiment.controlDocumentId)}
      />
    </Flex>
  );
};

const ABTestPanel: PanelComponent = ({ model, documentId, collectionType, document }) => {
  const t = useT();

  // Nothing to test until the entry exists, and only on content types enabled in the settings.
  if (collectionType !== 'collection-types' || !documentId || !isEnabledType(model)) {
    return null;
  }

  return {
    title: t('panel.title', 'A/B test'),
    content: (
      <PanelContent model={model} documentId={documentId} suggestedName={suggestName(document)} />
    ),
  };
};

export { ABTestPanel };
