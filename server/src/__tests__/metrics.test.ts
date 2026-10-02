import { describe, expect, it, vi } from 'vitest';

import metrics from '../services/metrics';
import type { Experiment } from '../types';

const experiment = (overrides: Partial<Experiment> = {}): Experiment => ({
  id: 1,
  documentId: 'experiment-1',
  key: 'article-a1b2c3',
  name: 'Homepage headline',
  hypothesis: 'A shorter headline converts better',
  contentType: 'api::article.article',
  controlDocumentId: 'control',
  variants: [
    { key: 'b', documentId: 'variant-b', weight: 25 },
    { key: 'c', documentId: 'variant-c', weight: 25 },
  ],
  status: 'running',
  startAt: null,
  endAt: null,
  locales: null,
  winner: null,
  ...overrides,
});

const setup = (
  options: { isDisabled?: boolean; experiments?: Experiment[]; send?: () => Promise<boolean> } = {}
) => {
  const send = vi.fn(options.send ?? (async () => true));
  const findAll = vi.fn(async () => options.experiments ?? []);
  const get = vi.fn(async () => ({ contentTypes: ['api::article.article', 'api::page.page'] }));

  const strapi = {
    telemetry: { isDisabled: options.isDisabled ?? false, send },
    plugin: () => ({
      service: (name: string) => (name === 'settings' ? { get } : { findAll }),
    }),
  };

  return { service: metrics({ strapi: strapi as never }), send, findAll, get };
};

describe('metrics', () => {
  it('reports how much the plugin is used when it starts', async () => {
    const { service, send } = setup({
      experiments: [
        experiment(),
        experiment({ status: 'draft' }),
        experiment({ status: 'completed', winner: 'b' }),
      ],
    });

    await service.sendDidInitializeEvent();

    expect(send).toHaveBeenCalledWith('didInitializeABTest', {
      groupProperties: {
        numberOfABTestContentTypes: 2,
        numberOfABTestExperiments: 3,
        numberOfRunningABTestExperiments: 1,
      },
    });
  });

  it('does not query anything when telemetry is disabled', async () => {
    const { service, send, findAll, get } = setup({ isDisabled: true });

    await service.sendDidInitializeEvent();

    expect(send).not.toHaveBeenCalled();
    expect(findAll).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it('never lets a failure reach the action being reported', async () => {
    const { service, findAll } = setup({
      send: async () => {
        throw new Error('network down');
      },
    });

    expect(() => service.sendDidCreateExperiment()).not.toThrow();

    findAll.mockRejectedValueOnce(new Error('database down'));
    await expect(service.sendDidInitializeEvent()).resolves.toBeUndefined();
  });

  it('describes how an experiment was started', () => {
    const { service, send } = setup();

    service.sendDidSetStatus(
      'start',
      experiment({ endAt: '2026-12-01T00:00:00.000Z', locales: ['fr'] })
    );

    expect(send).toHaveBeenCalledWith('didStartABTestExperiment', {
      eventProperties: { numberOfVariants: 2, hasSchedule: true, hasLocaleScope: true },
    });
  });

  it('reports whether the original or a variant won, not which one', () => {
    const { service, send } = setup();

    service.sendDidSetStatus('complete', experiment({ status: 'completed', winner: 'c' }));
    service.sendDidSetStatus('complete', experiment({ status: 'completed', winner: 'control' }));

    expect(send).toHaveBeenNthCalledWith(1, 'didCompleteABTestExperiment', {
      eventProperties: { numberOfVariants: 2, winner: 'variant' },
    });
    expect(send).toHaveBeenNthCalledWith(2, 'didCompleteABTestExperiment', {
      eventProperties: { numberOfVariants: 2, winner: 'control' },
    });
  });

  it('never sends anything that identifies the content', async () => {
    const tested = experiment({ startAt: '2026-11-01T00:00:00.000Z', locales: ['fr'] });
    const { service, send } = setup({ experiments: [tested] });

    await service.sendDidInitializeEvent();
    service.sendDidUpdateSettings(2);
    service.sendDidCreateExperiment();
    service.sendDidSetStatus('start', tested);
    service.sendDidSetStatus('pause', tested);
    service.sendDidSetStatus('complete', { ...tested, winner: 'b' });
    service.sendDidAddVariant(tested);
    service.sendDidRemoveVariant('keep');
    service.sendDidDiscardVariant(true);
    service.sendDidDeleteExperiment('delete');
    service.sendDidPrepareUninstall('keep', { experiments: 1, variants: 2 });

    const sent = JSON.stringify(send.mock.calls);

    for (const secret of [
      tested.documentId,
      tested.key,
      tested.name,
      tested.hypothesis,
      tested.contentType,
      tested.controlDocumentId,
      'variant-b',
      '"fr"',
    ]) {
      expect(sent).not.toContain(secret);
    }
  });
});
