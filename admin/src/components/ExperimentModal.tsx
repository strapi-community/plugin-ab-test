import * as React from 'react';

import {
  Box,
  Button,
  DateTimePicker,
  Divider,
  Field,
  Flex,
  Grid,
  IconButton,
  Modal,
  MultiSelect,
  MultiSelectOption,
  NumberInput,
  Textarea,
  TextInput,
  Typography,
} from '@strapi/design-system';
import { Plus, Trash } from '@strapi/icons';
import { useNotification } from '@strapi/strapi/admin';

import { getContentTypeInfo, useExperimentActions, useLocales, useUnchangedVariants } from '../api';
import { CONTROL_KEY } from '../constants';
import type { DisposeMode, Experiment } from '../types';
import { nextVariantKey, variantName } from '../utils/labels';
import { useT } from '../utils/useT';

import { CompleteDialog } from './CompleteDialog';
import { DisposeDialog } from './DisposeDialog';
import { StatusBadge } from './StatusBadge';

interface ExperimentModalProps {
  experiment: Experiment;
  canManage: boolean;
  onClose: () => void;
  /** Called with the new variant's documentId so the caller can open it for editing. */
  onVariantAdded?: (documentId: string) => void;
  onDeleted?: () => void;
}

type Dialog = 'complete' | 'delete' | { removeVariant: string } | null;

const toDate = (value: string | null) => (value ? new Date(value) : null);

const sameTime = (date: Date | null, value: string | null) =>
  (date ? date.getTime() : null) === (value ? Date.parse(value) : null);

/**
 * Everything about one experiment in a single place: its lifecycle (start, pause, pick a
 * winner), its variants, its settings, and deleting it.
 */
const ExperimentModal = ({
  experiment,
  canManage,
  onClose,
  onVariantAdded,
  onDeleted,
}: ExperimentModalProps) => {
  const t = useT();
  const actions = useExperimentActions();
  const { toggleNotification } = useNotification();
  const localized = getContentTypeInfo(experiment.contentType)?.localized === true;
  const availableLocales = useLocales(localized);
  const { status } = experiment;

  const [name, setName] = React.useState(experiment.name);
  const [hypothesis, setHypothesis] = React.useState(experiment.hypothesis ?? '');
  const [startAt, setStartAt] = React.useState(toDate(experiment.startAt));
  const [endAt, setEndAt] = React.useState(toDate(experiment.endAt));
  const [locales, setLocales] = React.useState(experiment.locales ?? []);
  const [weights, setWeights] = React.useState<Record<string, number>>(
    Object.fromEntries(experiment.variants.map((variant) => [variant.key, variant.weight]))
  );
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const total = experiment.variants.reduce((sum, variant) => sum + (weights[variant.key] ?? 0), 0);
  const isOverAllocated = total > 100;
  const hasInvalidSchedule = Boolean(startAt && endAt && endAt <= startAt);
  const isInvalid = name.trim() === '' || isOverAllocated || hasInvalidSchedule;

  const isDirty =
    name !== experiment.name ||
    hypothesis !== (experiment.hypothesis ?? '') ||
    !sameTime(startAt, experiment.startAt) ||
    !sameTime(endAt, experiment.endAt) ||
    locales.join() !== (experiment.locales ?? []).join() ||
    experiment.variants.some((variant) => (weights[variant.key] ?? 0) !== variant.weight);

  const canStart = canManage && (status === 'draft' || status === 'paused');
  const canEditVariants = canManage && (status === 'draft' || status === 'paused');
  const nextKey = nextVariantKey(experiment);

  // A variant that still equals the original blocks both starting and adding another one. The
  // server enforces it; asking up front lets the modal say why instead of failing on click.
  const unchanged = useUnchangedVariants(experiment.documentId, canStart);
  const unchangedVariant = unchanged.data[0];
  const blocksStart = unchanged.data.some((key) => (weights[key] ?? 0) > 0);

  const withBusy = async <T,>(label: string, action: () => Promise<T>): Promise<T> => {
    setBusy(label);

    try {
      return await action();
    } finally {
      setBusy(null);
    }
  };

  const notify = (message: string) => toggleNotification({ type: 'success', message });

  const save = () =>
    actions.update(experiment.documentId, {
      name,
      hypothesis: hypothesis || null,
      weights,
      startAt: startAt ? startAt.toISOString() : null,
      endAt: endAt ? endAt.toISOString() : null,
      locales: localized && locales.length > 0 ? locales : null,
    });

  const handleSave = async () => {
    if (await withBusy('save', save)) {
      onClose();
    }
  };

  const handleStart = async () => {
    const started = await withBusy('start', async () => {
      // Start with what the modal shows, not with settings that were typed but never saved.
      if (isDirty && !(await save())) {
        return undefined;
      }

      return actions.setStatus(experiment.documentId, 'start');
    });

    if (started) {
      notify(
        status === 'paused'
          ? t('notification.resumed', 'Experiment resumed')
          : t('notification.started', 'Experiment started')
      );
      onClose();
    }
  };

  const handlePause = async () => {
    if (await withBusy('pause', () => actions.setStatus(experiment.documentId, 'pause'))) {
      notify(t('notification.paused', 'Experiment paused'));
      onClose();
    }
  };

  const handleComplete = async (winner: string) => {
    setDialog(null);

    const completed = await withBusy('complete', () =>
      actions.setStatus(experiment.documentId, 'complete', winner)
    );

    if (completed) {
      notify(t('notification.completed', 'Experiment completed'));
      onClose();
    }
  };

  const handleAddVariant = async () => {
    const before = new Set(experiment.variants.map((variant) => variant.documentId));
    const updated = await withBusy('add', () => actions.addVariant(experiment.documentId));
    const added = updated?.variants.find((variant) => !before.has(variant.documentId));

    if (added) {
      onClose();
      onVariantAdded?.(added.documentId);
    }
  };

  const handleRemoveVariant = async (key: string, mode: DisposeMode) => {
    setDialog(null);

    if (await actions.removeVariant(experiment.documentId, key, mode)) {
      onClose();
    }
  };

  const handleDelete = async (mode: DisposeMode) => {
    setDialog(null);

    if (await withBusy('delete', () => actions.remove(experiment.documentId, mode))) {
      notify(t('notification.deleted', 'Experiment deleted'));
      onClose();
      onDeleted?.();
    }
  };

  const variantToRemove = dialog && typeof dialog === 'object' ? dialog.removeVariant : null;

  return (
    <Modal.Root open onOpenChange={(next) => !next && onClose()}>
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>{t('modal.title', 'Experiment settings')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Flex direction="column" alignItems="stretch" gap={6}>
            <Box background="neutral100" padding={4} hasRadius>
              <Flex direction="column" alignItems="stretch" gap={3}>
                <Flex justifyContent="space-between" gap={3} wrap="wrap">
                  <Flex gap={3}>
                    <StatusBadge status={status} />
                    {status === 'completed' ? (
                      <Typography>
                        {t('panel.winner', 'Served to everyone: {version}', {
                          version: variantName(experiment.winner ?? CONTROL_KEY),
                        })}
                      </Typography>
                    ) : null}
                  </Flex>
                  <Flex gap={2}>
                    {canStart ? (
                      <Button
                        loading={busy === 'start'}
                        disabled={unchanged.isLoading || blocksStart || isInvalid}
                        onClick={handleStart}
                      >
                        {status === 'paused'
                          ? t('action.resume', 'Resume experiment')
                          : t('action.start', 'Start experiment')}
                      </Button>
                    ) : null}
                    {canManage && status === 'running' ? (
                      <Button variant="secondary" loading={busy === 'pause'} onClick={handlePause}>
                        {t('action.pause', 'Pause experiment')}
                      </Button>
                    ) : null}
                    {canManage && (status === 'running' || status === 'paused') ? (
                      <Button
                        variant="tertiary"
                        loading={busy === 'complete'}
                        onClick={() => setDialog('complete')}
                      >
                        {t('action.complete', 'Pick a winner')}
                      </Button>
                    ) : null}
                  </Flex>
                </Flex>
                {canStart && unchangedVariant ? (
                  <Typography variant="pi" textColor="neutral600">
                    {t(
                      'action.unchanged',
                      '{name} is still identical to the original. Change and save it to start the experiment or add another variant.',
                      { name: variantName(unchangedVariant) }
                    )}
                  </Typography>
                ) : null}
              </Flex>
            </Box>

            <Flex direction="column" alignItems="stretch" gap={4}>
              <Field.Root name="name" required>
                <Field.Label>{t('modal.name', 'Name')}</Field.Label>
                <TextInput
                  value={name}
                  disabled={!canManage}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setName(event.target.value)
                  }
                />
              </Field.Root>
              <Field.Root
                name="hypothesis"
                hint={t('modal.hypothesis.hint', 'What you expect this test to show, and why.')}
              >
                <Field.Label>{t('modal.hypothesis', 'Hypothesis')}</Field.Label>
                <Textarea
                  value={hypothesis}
                  disabled={!canManage}
                  onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setHypothesis(event.target.value)
                  }
                />
                <Field.Hint />
              </Field.Root>
            </Flex>

            <Flex direction="column" alignItems="stretch" gap={3}>
              <Typography variant="delta" tag="h3">
                {t('modal.split', 'Traffic split')}
              </Typography>
              <Flex justifyContent="space-between">
                <Typography>{variantName(CONTROL_KEY)}</Typography>
                <Typography fontWeight="bold">{Math.max(0, 100 - total)}%</Typography>
              </Flex>
              {experiment.variants.map((variant) => (
                <Flex key={variant.key} gap={3} alignItems="flex-end">
                  <Box flex="1">
                    <Field.Root name={`weight-${variant.key}`}>
                      <Field.Label>
                        {t('modal.share', '{name} (% of visitors)', {
                          name: variantName(variant.key),
                        })}
                      </Field.Label>
                      <NumberInput
                        value={weights[variant.key]}
                        disabled={!canManage}
                        onValueChange={(value) =>
                          setWeights((current) => ({ ...current, [variant.key]: value ?? 0 }))
                        }
                      />
                    </Field.Root>
                  </Box>
                  {canManage && status !== 'running' && experiment.winner !== variant.key ? (
                    <IconButton
                      label={t('modal.remove-variant', 'Remove {name}', {
                        name: variantName(variant.key),
                      })}
                      onClick={() => setDialog({ removeVariant: variant.key })}
                    >
                      <Trash />
                    </IconButton>
                  ) : null}
                </Flex>
              ))}
              {isOverAllocated ? (
                <Typography textColor="danger600" variant="pi">
                  {t('modal.split.error', 'Variants cannot add up to more than 100%.')}
                </Typography>
              ) : null}
              {canEditVariants && nextKey ? (
                <Flex>
                  <Button
                    variant="secondary"
                    startIcon={<Plus />}
                    loading={busy === 'add'}
                    disabled={unchanged.isLoading || Boolean(unchangedVariant)}
                    onClick={handleAddVariant}
                  >
                    {t('action.add-variant', 'Add {name}', { name: variantName(nextKey) })}
                  </Button>
                </Flex>
              ) : null}
            </Flex>

            <Flex direction="column" alignItems="stretch" gap={3}>
              <Typography variant="delta" tag="h3">
                {t('modal.schedule', 'Schedule')}
              </Typography>
              <Grid.Root gap={4}>
                <Grid.Item col={6} xs={12} direction="column" alignItems="stretch">
                  <Field.Root name="startAt">
                    <Field.Label>{t('modal.start', 'Starts')}</Field.Label>
                    <DateTimePicker
                      value={startAt}
                      disabled={!canManage}
                      onChange={(date) => setStartAt(date ?? null)}
                      onClear={() => setStartAt(null)}
                    />
                  </Field.Root>
                </Grid.Item>
                <Grid.Item col={6} xs={12} direction="column" alignItems="stretch">
                  <Field.Root
                    name="endAt"
                    error={
                      hasInvalidSchedule
                        ? t('modal.schedule.error', 'The end must be after the start.')
                        : undefined
                    }
                  >
                    <Field.Label>{t('modal.end', 'Ends')}</Field.Label>
                    <DateTimePicker
                      value={endAt}
                      disabled={!canManage}
                      onChange={(date) => setEndAt(date ?? null)}
                      onClear={() => setEndAt(null)}
                    />
                    <Field.Error />
                  </Field.Root>
                </Grid.Item>
              </Grid.Root>
              <Typography textColor="neutral600" variant="pi">
                {t(
                  'modal.schedule.hint',
                  'Optional. Outside these dates a running experiment serves the original.'
                )}
              </Typography>
            </Flex>

            {localized ? (
              <Field.Root
                name="locales"
                hint={t(
                  'modal.locales.hint',
                  'Leave empty to run in every locale. A locale where a variant is not published serves the original.'
                )}
              >
                <Field.Label>{t('modal.locales', 'Locales')}</Field.Label>
                <MultiSelect
                  value={locales}
                  disabled={!canManage}
                  placeholder={t('modal.locales.all', 'All locales')}
                  onChange={(values: string[]) => setLocales(values)}
                  onClear={() => setLocales([])}
                  withTags
                >
                  {availableLocales.map((locale) => (
                    <MultiSelectOption key={locale.code} value={locale.code}>
                      {locale.name}
                    </MultiSelectOption>
                  ))}
                </MultiSelect>
                <Field.Hint />
              </Field.Root>
            ) : null}

            {canManage ? (
              <>
                <Divider />
                <Flex justifyContent="space-between" alignItems="center" gap={4}>
                  <Flex direction="column" alignItems="flex-start" gap={1}>
                    <Typography fontWeight="bold">
                      {t('delete.title', 'Delete this experiment')}
                    </Typography>
                    <Typography variant="pi" textColor="neutral600">
                      {t(
                        'delete.hint',
                        'Visitors go back to the original entry. You choose what happens to the variants.'
                      )}
                    </Typography>
                  </Flex>
                  <Button
                    variant="danger-light"
                    loading={busy === 'delete'}
                    onClick={() => setDialog('delete')}
                  >
                    {t('action.delete', 'Delete experiment')}
                  </Button>
                </Flex>
              </>
            ) : null}
          </Flex>
        </Modal.Body>
        <Modal.Footer>
          <Modal.Close>
            <Button variant="tertiary">{t('action.cancel', 'Cancel')}</Button>
          </Modal.Close>
          {canManage ? (
            <Button onClick={handleSave} loading={busy === 'save'} disabled={isInvalid || !isDirty}>
              {t('action.save', 'Save')}
            </Button>
          ) : null}
        </Modal.Footer>
      </Modal.Content>

      <CompleteDialog
        experiment={experiment}
        open={dialog === 'complete'}
        onClose={() => setDialog(null)}
        onConfirm={handleComplete}
      />

      <DisposeDialog
        open={dialog === 'delete'}
        title={t('delete.title', 'Delete this experiment')}
        description={t(
          'delete.description',
          'Visitors go back to the original entry. What should happen to the variants?'
        )}
        onClose={() => setDialog(null)}
        onChoose={handleDelete}
      />

      <DisposeDialog
        open={variantToRemove !== null}
        title={t('modal.remove-variant.title', 'Remove this variant')}
        description={t(
          'modal.remove-variant.description',
          'The variant leaves the experiment. What should happen to its entry?'
        )}
        onClose={() => setDialog(null)}
        onChoose={(mode) =>
          variantToRemove ? handleRemoveVariant(variantToRemove, mode) : undefined
        }
      />
    </Modal.Root>
  );
};

export { ExperimentModal };
