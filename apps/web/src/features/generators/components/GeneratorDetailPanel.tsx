import React, { memo, useCallback, useState } from 'react';

import {
  ProfileActionButton,
  ProfileIconButton,
} from '../../../components/profile/actions/ProfileActionButton';
import EditableDetailForm from '../../../features/auth/components/profile/tabs/shared/EditableDetailForm';
import { useEditableDetail } from '../../../features/auth/components/profile/tabs/shared/useEditableDetail';
import { profileApiService } from '../../../features/auth/services/profileApiService';

interface FormField {
  label: string;
  name: string;
  type: string;
  required: boolean;
  placeholder?: string;
  options?: { label: string; value: string }[];
}

interface FormSchema {
  fields?: FormField[];
}

interface GeneratorDetailData {
  id: string;
  name?: string;
  title?: string;
  slug: string;
  description?: string;
  prompt?: string;
  contact_email?: string;
  form_schema?: Record<string, unknown>;
  usage_count?: number;
  created_at?: string;
}

interface GeneratorDetailPanelProps {
  generator: GeneratorDetailData;
  onOpen: (generator: GeneratorDetailData) => void;
  onDeleted: () => void;
  onUpdated: () => void;
}

const GeneratorDetailPanel: React.FC<GeneratorDetailPanelProps> = memo(
  ({ generator, onOpen, onDeleted, onUpdated }) => {
    const [successMessage, setSuccessMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const { isEditing, isLoading, startEdit, cancelEdit, saveEdit, updateField, getDisplayValue } =
      useEditableDetail({
        entityId: generator.id,
        entity: generator,
        updateFn: profileApiService.updateCustomGenerator as (
          entityId: string,
          data: unknown
        ) => Promise<unknown>,
        onSuccessMessage: (msg: string) => {
          setSuccessMessage(msg);
          if (msg) onUpdated();
        },
        onErrorMessage: setErrorMessage,
        entityType: 'generator',
      });

    const handleDelete = useCallback(async () => {
      setIsDeleting(true);
      setErrorMessage('');
      try {
        await profileApiService.deleteCustomGenerator(generator.id);
        onDeleted();
      } catch {
        setErrorMessage('Fehler beim Löschen des Grünerators.');
      } finally {
        setIsDeleting(false);
        setShowDeleteConfirm(false);
      }
    }, [generator.id, onDeleted]);

    const handleUpdateFormSchema = useCallback(
      (schema: FormSchema) => {
        updateField('form_schema', schema);
      },
      [updateField]
    );

    return (
      <div className="bg-background-pure dark:bg-background-alt border border-primary-500 border-t-0 rounded-b-lg p-lg mb-xs text-left animate-in fade-in slide-in-from-top-1 duration-150">
        {successMessage && (
          <div className="px-md py-sm rounded-sm text-[0.85rem] mb-md bg-[color-mix(in_srgb,var(--klee)_15%,transparent)] text-[var(--klee)] border border-[color-mix(in_srgb,var(--klee)_30%,transparent)]">
            {successMessage}
          </div>
        )}
        {errorMessage && (
          <div className="px-md py-sm rounded-sm text-[0.85rem] mb-md bg-[color-mix(in_srgb,var(--color-red,#ff4d4d)_15%,transparent)] text-[var(--color-red,#ff4d4d)] border border-[color-mix(in_srgb,var(--color-red,#ff4d4d)_30%,transparent)]">
            {errorMessage}
          </div>
        )}

        {isEditing ? (
          <EditableDetailForm
            entityType="generator"
            getDisplayValue={getDisplayValue as (field: string) => string}
            getFormSchema={() =>
              getDisplayValue('form_schema') as unknown as FormSchema | undefined
            }
            updateField={updateField}
            updateFormSchema={handleUpdateFormSchema}
            onSave={saveEdit}
            onCancel={cancelEdit}
            isLoading={isLoading}
          />
        ) : (
          <>
            <div className="grid gap-xs mb-md">
              <div className="flex gap-md text-sm leading-relaxed max-md:flex-col max-md:gap-0.5">
                <span className="text-foreground-heading font-semibold min-w-[100px] shrink-0 max-md:min-w-0">
                  Titel
                </span>
                <span className="text-foreground">{generator.title || generator.name || '–'}</span>
              </div>
              {generator.description && (
                <div className="flex gap-md text-sm leading-relaxed max-md:flex-col max-md:gap-0.5">
                  <span className="text-foreground-heading font-semibold min-w-[100px] shrink-0 max-md:min-w-0">
                    Beschreibung
                  </span>
                  <span className="text-foreground">{generator.description}</span>
                </div>
              )}
              <div className="flex gap-md text-sm leading-relaxed max-md:flex-col max-md:gap-0.5">
                <span className="text-foreground-heading font-semibold min-w-[100px] shrink-0 max-md:min-w-0">
                  URL
                </span>
                <span className="text-foreground font-mono text-[0.85rem] text-grey-400">
                  /gruenerator/{generator.slug}
                </span>
              </div>
              {generator.usage_count !== undefined && generator.usage_count > 0 && (
                <div className="flex gap-md text-sm leading-relaxed max-md:flex-col max-md:gap-0.5">
                  <span className="text-foreground-heading font-semibold min-w-[100px] shrink-0 max-md:min-w-0">
                    Nutzungen
                  </span>
                  <span className="text-foreground">{generator.usage_count}</span>
                </div>
              )}
            </div>

            <div className="flex gap-sm items-center flex-wrap max-md:flex-col max-md:items-stretch">
              <ProfileActionButton
                action="open"
                label="Öffnen"
                variant="primary"
                onClick={() => onOpen(generator)}
                size="s"
              />
              <ProfileActionButton
                action="edit"
                label="Bearbeiten"
                variant="secondary"
                onClick={startEdit}
                size="s"
              />
              {showDeleteConfirm ? (
                <div className="flex items-center gap-sm ml-auto max-md:ml-0 max-md:flex-wrap">
                  <span className="text-[0.85rem] text-[var(--color-red,#ff4d4d)] font-medium">
                    Wirklich löschen?
                  </span>
                  <ProfileActionButton
                    action="delete"
                    label="Ja, löschen"
                    variant="danger"
                    onClick={handleDelete}
                    loading={isDeleting}
                    disabled={isDeleting}
                    size="s"
                  />
                  <ProfileActionButton
                    action="back"
                    label="Abbrechen"
                    variant="ghost"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={isDeleting}
                    size="s"
                  />
                </div>
              ) : (
                <ProfileIconButton
                  action="delete"
                  variant="delete"
                  onClick={() => setShowDeleteConfirm(true)}
                  title="Löschen"
                  size="s"
                />
              )}
            </div>
          </>
        )}
      </div>
    );
  }
);

GeneratorDetailPanel.displayName = 'GeneratorDetailPanel';

export default GeneratorDetailPanel;
