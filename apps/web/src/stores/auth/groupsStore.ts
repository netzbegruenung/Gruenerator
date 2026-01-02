import { create } from 'zustand';

/**
 * Type definitions for groups store
 */
type CurrentView = 'overview' | 'group' | 'create';
type GroupDetailView = 'gruppeninfo' | 'anweisungen-wissen' | 'shared' | 'wolke';

interface GroupsStoreState {
  // Loading states
  isSaving: boolean;
  isDeleting: boolean;
  isCreating: boolean;
  isJoining: boolean;

  // Specific states
  deletingGroupId: string | null;

  // Success states
  saveSuccess: boolean;
  createSuccess: boolean;
  deleteSuccess: boolean;
  joinSuccess: boolean;

  // Error states
  saveError: string | null;
  createError: string | null;
  deleteError: string | null;
  joinError: string | null;

  // Messages
  successMessage: string;
  errorMessage: string;

  // Navigation and selection state
  selectedGroupId: string | null;
  currentView: CurrentView;
  groupDetailView: GroupDetailView;

  // User preferences
  hasInitialAutoSelection: boolean;

  // Actions
  setSaving: (isSaving: boolean) => void;
  setDeleting: (isDeleting: boolean) => void;
  setCreating: (isCreating: boolean) => void;
  setJoining: (isJoining: boolean) => void;

  setDeletingGroupId: (groupId: string | null) => void;

  setSaveSuccess: (success: boolean) => void;
  setCreateSuccess: (success: boolean) => void;
  setDeleteSuccess: (success: boolean) => void;
  setJoinSuccess: (success: boolean) => void;

  setSaveError: (error: string | null) => void;
  setCreateError: (error: string | null) => void;
  setDeleteError: (error: string | null) => void;
  setJoinError: (error: string | null) => void;

  setSuccessMessage: (message: string) => void;
  setErrorMessage: (message: string) => void;

  // Navigation actions
  setSelectedGroup: (groupId: string | null) => void;
  setCurrentView: (view: CurrentView) => void;
  setGroupDetailView: (view: GroupDetailView) => void;

  // Auto-selection tracking
  setHasInitialAutoSelection: (hasSelected: boolean) => void;

  clearMessages: () => void;
  reset: () => void;
  resetNavigation: () => void;
}

/**
 * Zustand store for comprehensive groups state management
 * Includes UI states, navigation state, and user preferences
 * Follows the pattern of wolkeStore and profileStore
 */
export const useGroupsStore = create<GroupsStoreState>((set) => ({
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
  currentView: 'overview',
  groupDetailView: 'anweisungen-wissen',

  // User preferences
  hasInitialAutoSelection: false,

  // Actions
  setSaving: (isSaving: boolean) => set({ isSaving }),
  setDeleting: (isDeleting: boolean) => set({ isDeleting }),
  setCreating: (isCreating: boolean) => set({ isCreating }),
  setJoining: (isJoining: boolean) => set({ isJoining }),

  setDeletingGroupId: (groupId: string | null) => set({ deletingGroupId: groupId }),

  setSaveSuccess: (success: boolean) => set({ saveSuccess: success }),
  setCreateSuccess: (success: boolean) => set({ createSuccess: success }),
  setDeleteSuccess: (success: boolean) => set({ deleteSuccess: success }),
  setJoinSuccess: (success: boolean) => set({ joinSuccess: success }),

  setSaveError: (error: string | null) => set({ saveError: error }),
  setCreateError: (error: string | null) => set({ createError: error }),
  setDeleteError: (error: string | null) => set({ deleteError: error }),
  setJoinError: (error: string | null) => set({ joinError: error }),

  setSuccessMessage: (message: string) => set({ successMessage: message }),
  setErrorMessage: (message: string) => set({ errorMessage: message }),

  // Navigation actions
  setSelectedGroup: (groupId: string | null) => set((state: GroupsStoreState) => ({
    selectedGroupId: groupId,
    currentView: groupId ? 'group' : 'overview',
    // Reset detail view when switching groups
    groupDetailView: groupId && groupId !== state.selectedGroupId ? 'anweisungen-wissen' : state.groupDetailView
  })),

  setCurrentView: (view: CurrentView) => set({ currentView: view }),
  setGroupDetailView: (view: GroupDetailView) => set({ groupDetailView: view }),

  // Auto-selection tracking
  setHasInitialAutoSelection: (hasSelected: boolean) => set({ hasInitialAutoSelection: hasSelected }),

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
