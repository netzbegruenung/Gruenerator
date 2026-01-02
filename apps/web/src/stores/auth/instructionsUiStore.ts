import { create } from 'zustand';

/**
 * Generic Zustand store to manage UI state for form components that handle
 * instructions and knowledge management (AnweisungenWissenTab, GroupsManagementTab).
 * This centralizes UI state (loading, errors, etc.) and decouples it from
 * the data fetching/mutation logic in hooks.
 */

interface InstructionsUiState {
  isSaving: boolean;
  isDeleting: boolean;
  error: string | null;
  successMessage: string | null;
  hasUnsavedChanges: boolean;
  deletingKnowledgeId: string | null;
  setSaving: (isSaving: boolean) => void;
  setDeleting: (isDeleting: boolean, deletingKnowledgeId?: string | null) => void;
  setSuccess: (message: string) => void;
  setError: (errorMessage: string) => void;
  setHasUnsavedChanges: (hasUnsavedChanges: boolean) => void;
  clearMessages: () => void;
  reset: () => void;
}

export const useInstructionsUiStore = create<InstructionsUiState>((set) => ({
  // State
  isSaving: false,
  isDeleting: false,
  error: null,
  successMessage: null,
  hasUnsavedChanges: false,
  deletingKnowledgeId: null,

  // Actions
  setSaving: (isSaving: boolean) => set({ isSaving, error: null, successMessage: null }),
  setDeleting: (isDeleting: boolean, deletingKnowledgeId: string | null = null) => set({ isDeleting, deletingKnowledgeId, error: null, successMessage: null }),

  setSuccess: (message: string) => set({ successMessage: message, error: null, isSaving: false, isDeleting: false }),
  setError: (errorMessage: string) => set({ error: errorMessage, successMessage: null, isSaving: false, isDeleting: false }),

  setHasUnsavedChanges: (hasUnsavedChanges: boolean) => set({ hasUnsavedChanges }),

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