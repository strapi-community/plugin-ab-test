import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';

import { PLUGIN_ID, POSTHOG_DEFAULT_HOST, POSTHOG_STORE_KEY } from '../constants';
import type { PosthogConnection } from '../types';
import { describeFailure } from '../utils/posthog';

const { ValidationError } = errors;

export interface PosthogConfig {
  host: string;
  projectId: string;
  personalApiKey: string;
  /** The plugin config file wins over what was saved from the settings page. */
  source: 'config' | 'settings';
}

export interface PosthogInput {
  host?: unknown;
  projectId?: unknown;
  personalApiKey?: unknown;
}

interface Stored {
  host: string;
  projectId: string;
  /** Encrypted with Strapi's encryption key: the plain key is never written to the database. */
  personalApiKey: string;
}

interface Encryption {
  encrypt(value: string): string | null;
  decrypt(value: string): string | null;
}

const TIMEOUT_MS = 15_000;

const asText = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';

const toHost = (value: unknown): string =>
  (asText(value) || POSTHOG_DEFAULT_HOST).replace(/\/+$/, '');

/** Enough of a key to recognise it, never enough to use it. */
const hint = (key: string): string => `${key.slice(0, 4)}…${key.slice(-4)}`;

/** The kinds of PostHog key people paste by mistake, which cannot run queries. */
const WRONG_KEYS: Record<string, string> = {
  phc_: 'This is the project token your frontend uses.',
  phs_: 'This is a project secret key.',
};

/**
 * The optional connection to a PostHog project: where it is set up, how the key is kept, and
 * the one request the plugin makes to PostHog. Results work without it never being called.
 */
const posthog = ({ strapi }: { strapi: Core.Strapi }) => {
  const store = () => strapi.store({ type: 'plugin', name: PLUGIN_ID });

  const encryption = (): Encryption | undefined =>
    (strapi as unknown as { service(uid: string): Encryption | undefined }).service(
      'admin::encryption'
    );

  const fromFile = (): PosthogConfig | null => {
    const raw = strapi.config.get(`plugin::${PLUGIN_ID}.posthog`) as
      Record<string, unknown> | null | undefined;

    if (!raw?.projectId || !raw?.personalApiKey) {
      return null;
    }

    return {
      host: toHost(raw.host),
      projectId: asText(raw.projectId),
      personalApiKey: asText(raw.personalApiKey),
      source: 'config',
    };
  };

  const readStored = async (): Promise<Stored | null> => {
    const value = (await store().get({ key: POSTHOG_STORE_KEY })) as Partial<Stored> | null;

    return value?.projectId && value?.personalApiKey ? (value as Stored) : null;
  };

  const fromSettings = async (): Promise<PosthogConfig | null> => {
    const stored = await readStored();
    // Null when Strapi's encryption key changed since the key was saved: connect again.
    const personalApiKey = stored ? encryption()?.decrypt(stored.personalApiKey) : null;

    return stored && personalApiKey
      ? {
          host: stored.host,
          projectId: stored.projectId,
          personalApiKey,
          source: 'settings',
        }
      : null;
  };

  const resolve = async (): Promise<PosthogConfig | null> => fromFile() ?? (await fromSettings());

  const query = async (
    config: Pick<PosthogConfig, 'host' | 'projectId' | 'personalApiKey'>,
    hogql: { query: string; values?: Record<string, unknown> }
  ): Promise<unknown[][]> => {
    let response: Response;

    try {
      response = await fetch(
        `${config.host}/api/projects/${encodeURIComponent(config.projectId)}/query/`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.personalApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: { kind: 'HogQLQuery', ...hogql },
            name: 'strapi-ab-test-results',
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        }
      );
    } catch {
      throw new Error(`PostHog could not be reached at ${config.host}.`);
    }

    const body = (await response.json().catch(() => null)) as {
      results?: unknown;
      detail?: unknown;
    } | null;

    if (!response.ok) {
      const detail = typeof body?.detail === 'string' ? body.detail : '';

      throw new Error(describeFailure(response.status, detail, config));
    }

    return Array.isArray(body?.results) ? (body.results as unknown[][]) : [];
  };

  const connection = async (): Promise<PosthogConnection> => {
    const config = await resolve();

    return {
      connected: config !== null,
      host: config?.host ?? null,
      projectId: config?.projectId ?? null,
      source: config?.source ?? null,
      keyHint: config ? hint(config.personalApiKey) : null,
    };
  };

  return {
    resolve,
    query,
    connection,

    /**
     * Saves a connection from the settings page, once PostHog has accepted it: a key that
     * cannot read results is refused here rather than discovered on an experiment later.
     */
    async connect(input: PosthogInput): Promise<PosthogConnection> {
      if (fromFile()) {
        throw new ValidationError(
          'PostHog is set up in config/plugins.ts, which takes precedence. Remove it there to manage the connection from this page.'
        );
      }

      const host = toHost(input.host);
      const projectId = asText(input.projectId);
      // Left empty, the key already saved is kept: changing the project does not need it again.
      const personalApiKey =
        asText(input.personalApiKey) || (await fromSettings())?.personalApiKey || '';

      if (!/^https?:\/\/[^\s/]+/.test(host)) {
        throw new ValidationError('The host must be a URL, such as https://eu.posthog.com.');
      }

      if (!/^\d+$/.test(projectId)) {
        throw new ValidationError(
          'The project ID is the number in the address of your PostHog project.'
        );
      }

      if (!personalApiKey) {
        throw new ValidationError('A personal API key is required.');
      }

      const mistake = WRONG_KEYS[personalApiKey.slice(0, 4)];

      if (mistake) {
        throw new ValidationError(
          `${mistake} PostHog only runs queries with a personal API key (phx_…) that has the "Query Read" scope.`
        );
      }

      const encrypted = encryption()?.encrypt(personalApiKey);

      if (!encrypted) {
        throw new ValidationError(
          'The key cannot be stored safely: Strapi has no encryption key. Set admin.secrets.encryptionKey, or set PostHog up in config/plugins.ts instead.'
        );
      }

      try {
        await query({ host, projectId, personalApiKey }, { query: 'SELECT 1' });
      } catch (error) {
        throw new ValidationError((error as Error).message);
      }

      const value: Stored = { host, projectId, personalApiKey: encrypted };
      await store().set({ key: POSTHOG_STORE_KEY, value });

      return connection();
    },

    /** Forgets the connection saved from the settings page, and its key. */
    async disconnect(): Promise<PosthogConnection> {
      await store().delete({ key: POSTHOG_STORE_KEY });

      return connection();
    },
  };
};

export default posthog;
