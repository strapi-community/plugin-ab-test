import * as React from 'react';

import {
  getFetchClient,
  useAPIErrorHandler,
  useFetchClient,
  useNotification,
} from '@strapi/strapi/admin';

import { PLUGIN_ID } from './pluginId';
import type {
  ContentTypeInfo,
  DisposeMode,
  Experiment,
  ExperimentSummary,
  ExperimentUpdate,
  Lookup,
} from './types';

const BASE = `/${PLUGIN_ID}`;

/* -------------------------------------------------------------------------------------------------
 * Shared state
 *
 * The edit view renders several plugin components for the same document (picker, panel). They
 * share one request through these caches, and re-fetch together when `invalidate` runs.
 * -----------------------------------------------------------------------------------------------*/

let version = 0;
let contentTypes: ContentTypeInfo[] = [];

const listeners = new Set<() => void>();
const lookups = new Map<string, Promise<Lookup | null>>();
const summaries = new Map<string, { data: ExperimentSummary | null; at: number }>();

/**
 * How long a fetched answer is reused. Long enough for the components of one page to share a
 * request, short enough that coming back to a page after a change made elsewhere (an entry
 * deleted from the Content Manager, for instance) shows the current state.
 */
const REUSE_MS = 2000;
const queues = new Map<string, { ids: Set<string>; waiters: Array<() => void> }>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

const getVersion = () => version;

export const invalidate = () => {
  version += 1;
  lookups.clear();
  summaries.clear();
  listeners.forEach((listener) => listener());
};

export const setContentTypes = (list: ContentTypeInfo[]) => {
  contentTypes = list;
  invalidate();
};

export const getContentTypeInfo = (uid?: string) => contentTypes.find((type) => type.uid === uid);

/** Synchronous on purpose: Content Manager hooks cannot wait for a request. */
export const isEnabledType = (uid?: string) => getContentTypeInfo(uid)?.enabled === true;

const useStoreVersion = () => React.useSyncExternalStore(subscribe, getVersion);

export const useContentTypes = () => {
  useStoreVersion();

  return contentTypes;
};

/* -------------------------------------------------------------------------------------------------
 * Queries
 * -----------------------------------------------------------------------------------------------*/

/** The experiment a document belongs to. Makes no request for content types that are not enabled. */
export const useLookup = (contentType?: string, documentId?: string) => {
  const { get } = useFetchClient();
  const getRef = React.useRef(get);
  getRef.current = get;

  const storeVersion = useStoreVersion();
  const enabled = isEnabledType(contentType) && Boolean(documentId);
  const key = `${contentType}:${documentId}`;
  const [state, setState] = React.useState<{ key: string; data: Lookup | null } | null>(null);

  React.useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let cancelled = false;
    let promise = lookups.get(key);

    if (!promise) {
      promise = getRef
        .current<{ data: Lookup | null }>(`${BASE}/experiments/lookup`, {
          params: { contentType, documentId },
        })
        .then((response) => response.data.data);

      lookups.set(key, promise);
      promise
        .then(() => setTimeout(() => lookups.delete(key), REUSE_MS))
        .catch(() => lookups.delete(key));
    }

    promise
      .then((data) => !cancelled && setState({ key, data }))
      .catch(() => !cancelled && setState({ key, data: null }));

    return () => {
      cancelled = true;
    };
  }, [enabled, key, contentType, documentId, storeVersion]);

  const current = enabled && state?.key === key ? state : null;

  return { data: current?.data ?? null, isLoading: enabled && !current };
};

/**
 * Experiment status for one row of a list. Rows rendered together are resolved with a single
 * request rather than one each.
 */
export const useSummary = (contentType: string, documentId: string) => {
  const { post } = useFetchClient();
  const postRef = React.useRef(post);
  postRef.current = post;

  const storeVersion = useStoreVersion();
  const [, rerender] = React.useReducer((count: number) => count + 1, 0);
  const key = `${contentType}:${documentId}`;

  React.useEffect(() => {
    const known = summaries.get(key);

    if (known && Date.now() - known.at < REUSE_MS) {
      return;
    }

    let queue = queues.get(contentType);

    if (!queue) {
      const created = { ids: new Set<string>(), waiters: [] as Array<() => void> };
      queue = created;
      queues.set(contentType, created);

      setTimeout(async () => {
        queues.delete(contentType);
        const documentIds = [...created.ids];

        try {
          const response = await postRef.current<{ data: Record<string, ExperimentSummary> }>(
            `${BASE}/experiments/lookup-many`,
            { contentType, documentIds }
          );
          const found = response.data.data;

          documentIds.forEach((id) =>
            summaries.set(`${contentType}:${id}`, { data: found[id] ?? null, at: Date.now() })
          );
        } catch {
          documentIds.forEach((id) =>
            summaries.set(`${contentType}:${id}`, { data: null, at: Date.now() })
          );
        }

        created.waiters.forEach((notify) => notify());
      }, 0);
    }

    queue.ids.add(documentId);
    queue.waiters.push(rerender);
  }, [contentType, documentId, key, storeVersion]);

  return summaries.get(key)?.data ?? null;
};

/** Keys of the variants whose saved content still equals the original's. */
export const useUnchangedVariants = (experimentDocumentId: string, enabled: boolean) => {
  const { get } = useFetchClient();
  const getRef = React.useRef(get);
  getRef.current = get;

  const storeVersion = useStoreVersion();
  const key = `${experimentDocumentId}:${storeVersion}`;
  const [state, setState] = React.useState<{ key: string; data: string[] } | null>(null);

  React.useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let cancelled = false;

    getRef
      .current<{ data: string[] }>(`${BASE}/experiments/${experimentDocumentId}/unchanged-variants`)
      .then((response) => !cancelled && setState({ key, data: response.data.data }))
      // If the check cannot run, the server still refuses an identical variant.
      .catch(() => !cancelled && setState({ key, data: [] }));

    return () => {
      cancelled = true;
    };
  }, [enabled, experimentDocumentId, key]);

  const current = enabled && state?.key === key ? state : null;

  return { data: current?.data ?? [], isLoading: enabled && !current };
};

export const useExperiments = () => {
  const { get } = useFetchClient();
  const getRef = React.useRef(get);
  getRef.current = get;

  const storeVersion = useStoreVersion();
  const [state, setState] = React.useState<{ data: Experiment[]; isLoading: boolean }>({
    data: [],
    isLoading: true,
  });

  React.useEffect(() => {
    let cancelled = false;

    getRef
      .current<{ data: Experiment[] }>(`${BASE}/experiments`)
      .then((response) => !cancelled && setState({ data: response.data.data, isLoading: false }))
      .catch(() => !cancelled && setState({ data: [], isLoading: false }));

    return () => {
      cancelled = true;
    };
  }, [storeVersion]);

  return state;
};

/** Locale codes and names, fetched only when a localized experiment is being edited. */
export const useLocales = (enabled: boolean) => {
  const { get } = useFetchClient();
  const getRef = React.useRef(get);
  getRef.current = get;

  const [locales, setLocales] = React.useState<Array<{ code: string; name: string }>>([]);

  React.useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let cancelled = false;

    getRef
      .current<Array<{ code: string; name: string }>>('/i18n/locales')
      .then((response) => !cancelled && setLocales(response.data))
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return locales;
};

/* -------------------------------------------------------------------------------------------------
 * Mutations
 * -----------------------------------------------------------------------------------------------*/

export const useExperimentActions = () => {
  const { get, post, put, del } = useFetchClient();
  const { toggleNotification } = useNotification();
  const { formatAPIError } = useAPIErrorHandler();

  const client = React.useRef({ get, post, put, del, toggleNotification, formatAPIError });
  client.current = { get, post, put, del, toggleNotification, formatAPIError };

  return React.useMemo(() => {
    /** Runs a request, refreshes every open view on success, and reports failures to the user. */
    const run = async <T>(
      request: () => Promise<{ data: { data: T } }>
    ): Promise<T | undefined> => {
      try {
        const response = await request();
        invalidate();

        return response.data.data;
      } catch (error) {
        client.current.toggleNotification({
          type: 'danger',
          message: client.current.formatAPIError(error as never),
        });

        return undefined;
      }
    };

    const reloadContentTypes = async () => {
      const response = await client.current.get<{ data: ContentTypeInfo[] }>(
        `${BASE}/content-types`
      );
      setContentTypes(response.data.data);
    };

    return {
      create: (contentType: string, controlDocumentId: string, name?: string) =>
        run<Experiment>(() =>
          client.current.post(`${BASE}/experiments`, { contentType, controlDocumentId, name })
        ),

      update: (documentId: string, data: ExperimentUpdate) =>
        run<Experiment>(() => client.current.put(`${BASE}/experiments/${documentId}`, data)),

      setStatus: (documentId: string, action: 'start' | 'pause' | 'complete', winner?: string) =>
        run<Experiment>(() =>
          client.current.post(`${BASE}/experiments/${documentId}/actions/${action}`, { winner })
        ),

      remove: (documentId: string, variants: DisposeMode) =>
        run<{ documentId: string }>(() =>
          client.current.del(`${BASE}/experiments/${documentId}?variants=${variants}`)
        ),

      addVariant: (documentId: string) =>
        run<Experiment>(() => client.current.post(`${BASE}/experiments/${documentId}/variants`)),

      /**
       * Runs after the editor has left the variant's page. The component that asked for it is
       * gone by then, and `useFetchClient` aborts a component's requests when it unmounts, so
       * this one goes through a standalone client. Quiet on purpose.
       */
      discardUnchangedVariant: async (documentId: string, key: string) => {
        try {
          const response = await getFetchClient().post<{
            data: { discarded: boolean; experimentDeleted: boolean };
          }>(`${BASE}/experiments/${documentId}/variants/${key}/discard-unchanged`);
          invalidate();

          return response.data.data;
        } catch {
          return undefined;
        }
      },

      removeVariant: (documentId: string, key: string, variants: DisposeMode) =>
        run<Experiment>(() =>
          client.current.del(
            `${BASE}/experiments/${documentId}/variants/${key}?variants=${variants}`
          )
        ),

      saveSettings: async (uids: string[]) => {
        const saved = await run<{ contentTypes: string[] }>(() =>
          client.current.put(`${BASE}/settings`, { contentTypes: uids })
        );

        if (saved) {
          await reloadContentTypes();
        }

        return saved;
      },

      prepareUninstall: async (variants: DisposeMode) => {
        const summary = await run<{ experiments: number; variants: number }>(() =>
          client.current.post(`${BASE}/uninstall/prepare`, { variants })
        );

        if (summary) {
          await reloadContentTypes();
        }

        return summary;
      },
    };
  }, []);
};
