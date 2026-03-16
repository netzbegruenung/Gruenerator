import { useCallback, useEffect } from 'react';

import { handleError } from '../../../../../../components/utils/errorHandling';
import {
  useGeneratorEditMode,
  useGeneratorChanges,
  useGeneratorLoading,
  useGeneratorValidationErrors,
  useProfileStore,
} from '../../../../../../stores/profileStore';

export interface UseEditableDetailOptions {
  entityId: string;
  entity: Record<string, unknown> | null;
  updateFn: (entityId: string, data: unknown) => Promise<unknown>;
  onSuccessMessage: (message: string) => void;
  onErrorMessage: (message: string) => void;
  entityType?: 'generator' | 'notebook';
}

export interface UseEditableDetailReturn {
  isEditing: boolean;
  editData: Record<string, unknown> | null;
  isLoading: boolean;
  validationErrors: Record<string, string> | null;
  startEdit: () => void;
  cancelEdit: () => void;
  saveEdit: () => Promise<void>;
  updateField: (field: string, value: unknown) => void;
  getDisplayValue: (field: string) => unknown;
  hasChanges: boolean;
}

/**
 * Shared hook for managing editable detail views (both generators and notebooks)
 * Eliminates duplicate state management and provides unified edit logic
 */
export const useEditableDetail = ({
  entityId,
  entity,
  updateFn,
  onSuccessMessage,
  onErrorMessage,
  entityType = 'generator',
}: UseEditableDetailOptions): UseEditableDetailReturn => {
  // Use existing profileStore hooks
  const isEditing = useGeneratorEditMode(entityId);
  const editData = useGeneratorChanges(entityId);
  const isLoading = useGeneratorLoading(entityId);
  const validationErrors = useGeneratorValidationErrors(entityId);

  // Get store actions
  const {
    setGeneratorEditMode,
    setGeneratorChanges,
    setGeneratorLoading,
    updateGeneratorOptimistic,
  } = useProfileStore();

  // Initialize edit data when starting edit mode
  const initializeEditData = useCallback((): Record<string, unknown> => {
    if (!entity) return {};

    if (entityType === 'generator') {
      // Handle form_schema parsing for generators
      let formSchema: unknown = { fields: [] };
      if (entity.form_schema) {
        if (typeof entity.form_schema === 'string') {
          try {
            formSchema = JSON.parse(entity.form_schema);
          } catch {
            formSchema = { fields: [] };
          }
        } else {
          formSchema = entity.form_schema;
        }
      }

      return {
        title: (entity.title as string) || (entity.name as string) || '',
        description: (entity.description as string) || '',
        contact_email: (entity.contact_email as string) || '',
        prompt: (entity.prompt as string) || '',
        form_schema: formSchema,
      };
    } else {
      // Notebook data
      return {
        name: (entity.name as string) || '',
        description: (entity.description as string) || '',
        custom_prompt: (entity.custom_prompt as string) || '',
      };
    }
  }, [entity, entityType]);

  // Get display value with fallback to edit data or entity
  const getDisplayValue = useCallback(
    (field: string): unknown => {
      if (editData && editData[field] !== undefined) {
        return editData[field];
      }

      if (entityType === 'generator') {
        if (field === 'title') return (entity?.title as string) || (entity?.name as string) || '';
        if (field === 'description') return (entity?.description as string) || '';
        if (field === 'contact_email') return (entity?.contact_email as string) || '';
        if (field === 'prompt') return (entity?.prompt as string) || '';
        if (field === 'form_schema') {
          let formSchema: unknown = { fields: [] };
          if (entity?.form_schema) {
            if (typeof entity.form_schema === 'string') {
              try {
                formSchema = JSON.parse(entity.form_schema);
              } catch {
                formSchema = { fields: [] };
              }
            } else {
              formSchema = entity.form_schema;
            }
          }
          return formSchema;
        }
      } else {
        // Notebook
        if (field === 'name') return (entity?.name as string) || '';
        if (field === 'description') return (entity?.description as string) || '';
        if (field === 'custom_prompt') return (entity?.custom_prompt as string) || '';
      }

      return '';
    },
    [
      editData,
      entityType,
      entity?.title,
      entity?.name,
      entity?.description,
      entity?.contact_email,
      entity?.prompt,
      entity?.form_schema,
      entity?.custom_prompt,
    ]
  );

  // Start editing
  const startEdit = useCallback(() => {
    const initialData = initializeEditData();
    setGeneratorChanges(entityId, initialData);
    setGeneratorEditMode(entityId, true);
    onErrorMessage('');
    onSuccessMessage('');
  }, [
    entityId,
    initializeEditData,
    setGeneratorChanges,
    setGeneratorEditMode,
    onErrorMessage,
    onSuccessMessage,
  ]);

  // Cancel editing
  const cancelEdit = useCallback(() => {
    setGeneratorEditMode(entityId, false);
  }, [entityId, setGeneratorEditMode]);

  // Update field
  const updateField = useCallback(
    (field: string, value: unknown) => {
      setGeneratorChanges(entityId, {
        ...editData,
        [field]: value,
      });
    },
    [entityId, editData, setGeneratorChanges]
  );

  // Save changes
  const saveEdit = useCallback(async () => {
    if (!entity || !editData || Object.keys(editData).length === 0) return;

    onErrorMessage('');
    onSuccessMessage('');

    // Basic validation
    const requiredField = entityType === 'generator' ? 'title' : 'name';
    if (!getDisplayValue(requiredField)) {
      onErrorMessage(`${entityType === 'generator' ? 'Titel' : 'Name'} darf nicht leer sein.`);
      return;
    }

    try {
      setGeneratorLoading(entityId, true);

      const updateData =
        entityType === 'generator'
          ? {
              name: entity.name,
              slug: entity.slug,
              title: getDisplayValue('title'),
              description: getDisplayValue('description'),
              contact_email: getDisplayValue('contact_email'),
              prompt: getDisplayValue('prompt'),
              form_schema: getDisplayValue('form_schema'),
            }
          : {
              name: getDisplayValue('name'),
              description: getDisplayValue('description'),
              custom_prompt: getDisplayValue('custom_prompt'),
            };

      // Optimistic update for generators
      if (entityType === 'generator') {
        updateGeneratorOptimistic(entityId, updateData);
      }

      await updateFn(entityId, updateData);

      const entityName = entityType === 'generator' ? 'Grünerator' : 'Notebook';
      onSuccessMessage(`${entityName} erfolgreich aktualisiert.`);
      setGeneratorEditMode(entityId, false);
    } catch (error) {
      handleError(error, onErrorMessage);
    } finally {
      setGeneratorLoading(entityId, false);
    }
  }, [
    entity,
    editData,
    entityId,
    entityType,
    getDisplayValue,
    updateFn,
    setGeneratorLoading,
    updateGeneratorOptimistic,
    setGeneratorEditMode,
    onErrorMessage,
    onSuccessMessage,
  ]);

  return {
    // State
    isEditing,
    editData,
    isLoading,
    validationErrors,

    // Actions
    startEdit,
    cancelEdit,
    saveEdit,
    updateField,
    getDisplayValue,

    // Utilities
    hasChanges: editData != null && Object.keys(editData).length > 0,
  };
};

export default useEditableDetail;
