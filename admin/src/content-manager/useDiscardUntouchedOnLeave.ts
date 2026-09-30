import * as React from 'react';

import { useNotification } from '@strapi/strapi/admin';

import { useExperimentActions } from '../api';
import { variantName } from '../utils/labels';
import { useT } from '../utils/useT';

// Discards scheduled by a page being left, keyed by variant; cancelled if the page comes back.
const pending = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Creating a variant saves a copy of the entry straight away, so the editor can work on it in
 * the regular edit view. If they leave that view without having changed anything, the copy is
 * dropped again: to the editor, a variant only exists once it has been edited and saved.
 */
export const useDiscardUntouchedOnLeave = (
  experimentDocumentId: string,
  variantKey: string,
  enabled: boolean
) => {
  const t = useT();
  const actions = useExperimentActions();
  const { toggleNotification } = useNotification();

  const latest = React.useRef({ t, actions, toggleNotification });
  latest.current = { t, actions, toggleNotification };

  React.useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const id = `${experimentDocumentId}:${variantKey}`;
    const scheduled = pending.get(id);

    // Mounted again before the discard ran (StrictMode, fast refresh): the page was not left.
    if (scheduled) {
      clearTimeout(scheduled);
      pending.delete(id);
    }

    return () => {
      pending.set(
        id,
        setTimeout(async () => {
          pending.delete(id);

          const result = await latest.current.actions.discardUnchangedVariant(
            experimentDocumentId,
            variantKey
          );

          if (result?.discarded) {
            latest.current.toggleNotification({
              type: 'info',
              message: latest.current.t(
                'notification.discarded',
                '{name} was discarded because it had no changes.',
                { name: variantName(variantKey) }
              ),
            });
          }
        }, 0)
      );
    };
  }, [enabled, experimentDocumentId, variantKey]);
};
