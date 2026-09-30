import * as React from 'react';

import { useIntl } from 'react-intl';

import { getTranslation } from './getTranslation';

type Values = Record<string, string | number>;

/** Shorthand for plugin-scoped messages: `t('panel.title', 'A/B test')`. */
export const useT = () => {
  const { formatMessage } = useIntl();

  return React.useCallback(
    (id: string, defaultMessage: string, values?: Values) =>
      formatMessage({ id: getTranslation(id), defaultMessage }, values),
    [formatMessage]
  );
};

/** Same as `useT`, for messages that embed React elements (such as inline code) in `values`. */
export const useRichT = () => {
  const { formatMessage } = useIntl();

  return React.useCallback(
    (id: string, defaultMessage: string, values: Record<string, React.ReactNode>) =>
      formatMessage({ id: getTranslation(id), defaultMessage }, values) as React.ReactNode,
    [formatMessage]
  );
};
