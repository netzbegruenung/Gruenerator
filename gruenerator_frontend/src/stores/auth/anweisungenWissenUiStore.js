import { create } from 'zustand';

/**
 * Zustand store to manage the UI state for the AnweisungenWissenTab.
 * This decouples UI state (loading, errors, etc.) from the data fetching/mutation logic
 * in the useAnweisungenWissen hook.
 */
export const useAnweisungenWissenUiStore = create((set) => ({
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