import { vi } from 'vitest';

import posthog from '../services/posthog';
import results from '../services/results';
import type { Experiment } from '../types';

interface Options {
  /** The `posthog` key of the plugin config file. */
  config?: unknown;
  /** What the settings page saved earlier. */
  stored?: unknown;
  /** False for an application without `admin.secrets.encryptionKey`. */
  canEncrypt?: boolean;
  experiment?: Experiment;
}

/** A Strapi with just what the PostHog and results services touch. */
export const mockStrapi = (options: Options = {}) => {
  const saved = new Map<string, unknown>(options.stored ? [['posthog', options.stored]] : []);

  const encryption = {
    encrypt: (value: string) => (options.canEncrypt === false ? null : `encrypted(${value})`),
    decrypt: (value: string) =>
      options.canEncrypt === false ? null : (/^encrypted\((.*)\)$/.exec(value)?.[1] ?? null),
  };

  const services: Record<string, unknown> = {
    experiments: { findOne: vi.fn(async () => options.experiment) },
  };

  const strapi = {
    config: { get: () => options.config },
    store: () => ({
      get: async ({ key }: { key: string }) => saved.get(key) ?? null,
      set: async ({ key, value }: { key: string; value: unknown }) => {
        saved.set(key, value);
      },
      delete: async ({ key }: { key: string }) => {
        saved.delete(key);
      },
    }),
    service: (uid: string) => (uid === 'admin::encryption' ? encryption : undefined),
    plugin: () => ({ service: (name: string) => services[name] }),
  };

  const service = posthog({ strapi: strapi as never });

  services.posthog = service;

  return { posthog: service, results: results({ strapi: strapi as never }), saved };
};

/** A `fetch` that answers like PostHog would. */
export const answer = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));
