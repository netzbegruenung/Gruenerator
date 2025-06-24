import { create } from 'zustand';

/**
 * Zustand store for groups UI state management
 * Follows the same pattern as anweisungenWissenUiStore
 */
export const useGroupsUiStore = create((set) => ({
  // Loading states
  isSaving: false,
  isDeleting: false,
  isCreating: false,
  isJoining: false,
  
  // Specific states
  deletingGroupId: null,
  
  // Success states
  saveSuccess: false,
  createSuccess: false,
  deleteSuccess: false,
  joinSuccess: false,
  
  // Error states
  saveError: null,
  createError: null,
  deleteError: null,
  joinError: null,
  
  // Messages
  successMessage: '',
  errorMessage: '',
  
  // Actions
  setSaving: (isSaving) => set({ isSaving }),
  setDeleting: (isDeleting) => set({ isDeleting }),
  setCreating: (isCreating) => set({ isCreating }),
  setJoining: (isJoining) => set({ isJoining }),
  
  setDeletingGroupId: (groupId) => set({ deletingGroupId: groupId }),
  
  setSaveSuccess: (success) => set({ saveSuccess: success }),
  setCreateSuccess: (success) => set({ createSuccess: success }),
  setDeleteSuccess: (success) => set({ deleteSuccess: success }),
  setJoinSuccess: (success) => set({ joinSuccess: success }),
  
  setSaveError: (error) => set({ saveError: error }),
  setCreateError: (error) => set({ createError: error }),
  setDeleteError: (error) => set({ deleteError: error }),
  setJoinError: (error) => set({ joinError: error }),
  
  setSuccessMessage: (message) => set({ successMessage: message }),
  setErrorMessage: (message) => set({ errorMessage: message }),
  
  clearMessages: () => set({
    successMessage: '',
    errorMessage: '',
    saveError: null,
    createError: null,
    deleteError: null,
    joinError: null,
    saveSuccess: false,
    createSuccess: false,
    deleteSuccess: false,
    joinSuccess: false
  }),
  
  // Reset all state
  reset: () => set({
    isSaving: false,
    isDeleting: false,
    isCreating: false,
    isJoining: false,
    deletingGroupId: null,
    saveSuccess: false,
    createSuccess: false,
    deleteSuccess: false,
    joinSuccess: false,
    saveError: null,
    createError: null,
    deleteError: null,
    joinError: null,
    successMessage: '',
    errorMessage: ''
  })
}));