import { create } from 'zustand';

/**
 * Generic Zustand store to manage UI state for form components that handle
 * instructions and knowledge management (AnweisungenWissenTab, GroupsManagementTab).
 * This centralizes UI state (loading, errors, etc.) and decouples it from 
 * the data fetching/mutation logic in hooks.
 */
export const useInstructionsUiStore = create<any>((set) => ({
  // State
  isSaving: false,
  isDeleting: false,
  error: null,
  successMessage: null,
  hasUnsavedChanges: false,
  deletingKnowledgeId: null,

  // Actions
  setSaving: (isSaving) => set({ isSaving, error: null, successMessage: null }),
  setDeleting: (isDeleting, deletingKnowledgeId = null) => set({ isDeleting, deletingKnowledgeId, error: null, successMessage: null }),
  
  setSuccess: (message) => set({ successMessage: message, error: null, isSaving: false, isDeleting: false }),
  setError: (errorMessage) => set({ error: errorMessage, successMessage: null, isSaving: false, isDeleting: false }),

  setHasUnsavedChanges: (hasUnsavedChanges) => set({ hasUnsavedChanges }),

  clearMessages: () => set({ error: null, successMessage: null }),
  reset: () => set({
    isSaving: false,
    isDeleting: false,
    error: null,
    successMessage: null,
    hasUnsavedChanges: false,
    deletingKnowledgeId: null,
  }),
}));

// Legacy export for backward compatibility
export const useAnweisungenWissenUiStore = useInstructionsUiStore;