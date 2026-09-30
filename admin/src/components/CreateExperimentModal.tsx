import * as React from 'react';

import { Button, Field, Modal, TextInput } from '@strapi/design-system';

import { useT } from '../utils/useT';

interface CreateExperimentModalProps {
  /** Pre-filled so the common case is one click; usually the title of the entry. */
  suggestedName: string;
  isCreating: boolean;
  onClose: () => void;
  onCreate: (name: string) => void | Promise<void>;
}

/**
 * Asks for the experiment's name before the first variant is created, so experiments can be
 * told apart in the list instead of all being called after their content type.
 */
const CreateExperimentModal = ({
  suggestedName,
  isCreating,
  onClose,
  onCreate,
}: CreateExperimentModalProps) => {
  const t = useT();
  const [name, setName] = React.useState(suggestedName);
  const trimmed = name.trim();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (trimmed !== '' && !isCreating) {
      onCreate(trimmed);
    }
  };

  return (
    <Modal.Root open onOpenChange={(next) => !next && onClose()}>
      <Modal.Content>
        <form onSubmit={handleSubmit}>
          <Modal.Header>
            <Modal.Title>{t('create.title', 'Create an A/B test')}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Field.Root
              name="name"
              required
              hint={t(
                'create.name.hint',
                'Shown in the list of experiments. A copy of this entry is created as Variant B for you to edit.'
              )}
            >
              <Field.Label>{t('create.name', 'Experiment name')}</Field.Label>
              <TextInput
                autoFocus
                value={name}
                maxLength={120}
                placeholder={t('create.name.placeholder', 'e.g. Contact page headline')}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setName(event.target.value)
                }
              />
              <Field.Hint />
            </Field.Root>
          </Modal.Body>
          <Modal.Footer>
            <Modal.Close>
              <Button variant="tertiary" type="button">
                {t('action.cancel', 'Cancel')}
              </Button>
            </Modal.Close>
            <Button type="submit" loading={isCreating} disabled={trimmed === ''}>
              {t('panel.create', 'Create a variant')}
            </Button>
          </Modal.Footer>
        </form>
      </Modal.Content>
    </Modal.Root>
  );
};

export { CreateExperimentModal };
