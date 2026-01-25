/**
 * Options for useEditableDetail hook
 */
export interface UseEditableDetailOptions {
  entityId: string;
  entity: unknown;
  updateFn: (entityId: string, data: unknown) => Promise<unknown>;
  onSuccessMessage: (message: string) => void;
  onErrorMessage: (message: string) => void;
  entityType?: 'generator' | 'notebook';
}

/**
 * Return value from useEditableDetail hook
 */
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
export function useEditableDetail(options: UseEditableDetailOptions): UseEditableDetailReturn;

export default useEditableDetail;
