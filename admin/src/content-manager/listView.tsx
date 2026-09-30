import { isEnabledType, useSummary } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { getTranslation } from '../utils/getTranslation';

import type { ListFieldLayout, ListLayout } from '@strapi/content-manager/strapi-admin';

interface AddColumnToTableHookArgs {
  layout: ListLayout;
  displayedHeaders: ListFieldLayout[];
}

const ABTestCell = ({ model, documentId }: { model: string; documentId: string }) => {
  const summary = useSummary(model, documentId);

  return summary ? <StatusBadge status={summary.status} /> : null;
};

const LIST_VIEW_PATH = /\/content-manager\/collection-types\/([^/?#]+)/;

/**
 * The hook receives the layout but not the content type it belongs to, so the uid is read from
 * the list view URL, which is the page the hook runs for.
 */
const getCurrentModel = () => {
  const match = LIST_VIEW_PATH.exec(window.location.pathname);

  return match ? decodeURIComponent(match[1]) : undefined;
};

/** Adds an "A/B test" column to the list view of enabled content types. */
const addColumnToTableHook = ({ displayedHeaders, layout }: AddColumnToTableHookArgs) => {
  if (!isEnabledType(getCurrentModel())) {
    return { displayedHeaders, layout };
  }

  return {
    displayedHeaders: [
      ...displayedHeaders,
      {
        attribute: { type: 'string' },
        label: {
          id: getTranslation('list.column'),
          defaultMessage: 'A/B test',
        },
        searchable: false,
        sortable: false,
        name: 'abTest',
        cellFormatter: (
          props: { documentId: string },
          _header: unknown,
          meta: { model: string }
        ) => <ABTestCell model={meta.model} documentId={props.documentId} />,
      },
    ],
    layout,
  };
};

export { addColumnToTableHook };
