import { create } from 'zustand';

/**
 * Zustand store for comprehensive groups state management
 * Includes UI states, navigation state, and user preferences
 * Follows the pattern of wolkeStore and profileStore
 */
export const useGroupsStore = create<any>((set) => ({
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
  
  // Navigation and selection state
  selectedGroupId: null,
  currentView: 'overview', // 'overview' | 'group' | 'create'
  groupDetailView: 'anweisungen-wissen', // 'gruppeninfo' | 'anweisungen-wissen' | 'shared' | 'wolke'
  
  // User preferences
  hasInitialAutoSelection: false,
  
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
  
  // Navigation actions
  setSelectedGroup: (groupId) => set((state) => ({ 
    selectedGroupId: groupId,
    currentView: groupId ? 'group' : 'overview',
    // Reset detail view when switching groups
    groupDetailView: groupId && groupId !== state.selectedGroupId ? 'anweisungen-wissen' : state.groupDetailView
  })),
  
  setCurrentView: (view) => set({ currentView: view }),
  setGroupDetailView: (view) => set({ groupDetailView: view }),
  
  // Auto-selection tracking
  setHasInitialAutoSelection: (hasSelected) => set({ hasInitialAutoSelection: hasSelected }),
  
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
    errorMessage: '',
    // Reset navigation state
    selectedGroupId: null,
    currentView: 'overview',
    groupDetailView: 'anweisungen-wissen',
    hasInitialAutoSelection: false
  }),
  
  // Reset only navigation state (useful for logout scenarios)
  resetNavigation: () => set({
    selectedGroupId: null,
    currentView: 'overview',
    groupDetailView: 'anweisungen-wissen',
    hasInitialAutoSelection: false
  })
}));