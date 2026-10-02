import { useIsDesktop } from '@strapi/strapi/admin';
import { useLocation, useNavigate } from 'react-router-dom';

import { useLookup } from '../api';
import { editPath, variantName, versionTargets } from '../utils/labels';
import { useT } from '../utils/useT';

import { VariantBanner, isUnpublished } from './VariantBanner';

import type { HeaderActionComponent } from '@strapi/content-manager/strapi-admin';

/**
 * The version picker lives in the A/B test card of the side panel. On narrow screens the edit
 * view tucks that panel into a drawer, which would leave no sign of which version is open, so
 * there the picker and the variant banner are shown from the header instead.
 */
const VariantPickerAction: HeaderActionComponent = ({
  model,
  documentId,
  collectionType,
  document,
  meta,
}) => {
  const t = useT();
  const navigate = useNavigate();
  const { search } = useLocation();
  const isDesktop = useIsDesktop();
  const { data } = useLookup(collectionType === 'collection-types' ? model : undefined, documentId);

  if (!data || isDesktop) {
    return null;
  }

  const { experiment, variantKey, role } = data;
  const targets = versionTargets(experiment);

  return {
    label: t('picker.label', 'A/B test version'),
    options: Object.keys(targets).map((key) => ({ value: key, label: variantName(key) })),
    value: variantKey,
    customizeContent: (value: string) => (
      <>
        {variantName(value)}
        {role === 'variant' ? (
          <VariantBanner
            experiment={experiment}
            variantKey={variantKey}
            isUnpublished={isUnpublished(model, document, meta)}
            onOpenOriginal={() => navigate(editPath(model, experiment.controlDocumentId, search))}
          />
        ) : null}
      </>
    ),
    onSelect: (value: string) => {
      if (value !== variantKey && targets[value]) {
        navigate(editPath(model, targets[value], search));
      }
    },
  };
};

export { VariantPickerAction };
