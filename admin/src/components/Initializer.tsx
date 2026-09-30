import { useEffect, useRef } from 'react';

import { useFetchClient } from '@strapi/strapi/admin';

import { setContentTypes } from '../api';
import { PLUGIN_ID } from '../pluginId';
import type { ContentTypeInfo } from '../types';

type InitializerProps = {
  setPlugin: (id: string) => void;
};

/**
 * Loads which content types have A/B testing enabled once, when the admin panel opens, so the
 * Content Manager extensions can decide synchronously whether to show anything.
 */
const Initializer = ({ setPlugin }: InitializerProps) => {
  const { get } = useFetchClient();
  const ref = useRef({ setPlugin, get });

  useEffect(() => {
    ref.current
      .get<{ data: ContentTypeInfo[] }>(`/${PLUGIN_ID}/content-types`)
      .then((response) => setContentTypes(response.data.data))
      // The admin panel must still open if this request fails; the plugin UI just stays hidden.
      .catch(() => {})
      .finally(() => ref.current.setPlugin(PLUGIN_ID));
  }, []);

  return null;
};

export { Initializer };
