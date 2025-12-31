import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

interface WebSearchConfig {
  isActive: boolean;
  isSearching: boolean;
  statusMessage: string;
  enabled: boolean;
}

interface PrivacyModeConfig {
  isActive: boolean;
  enabled: boolean;
}

interface FormSubmissionState {
  loading: boolean;
  success: boolean;
  error: string | null;
  formErrors: Record<string, string>;
  saveLoading: boolean;
}

interface FeatureState {
  webSearchConfig: WebSearchConfig;
  privacyModeConfig: PrivacyModeConfig;
  useFeatureIcons: boolean;
}

interface FileState {
  attachedFiles: File[];
  uploadedImage: string | null;
}

interface FormStateState {
  loading: boolean;
  success: boolean;
  error: string | null;
  formErrors: Record<string, string>;
  saveLoading: boolean;
  webSearchConfig: WebSearchConfig;
  privacyModeConfig: PrivacyModeConfig;
  useFeatureIcons: boolean;
  attachedFiles: File[];
  uploadedImage: string | null;
  isFormVisible: boolean;
  isStartMode: boolean;
}

interface FormStateActions {
  setLoading: (loading: boolean) => void;
  setSuccess: (success: boolean) => void;
  setError: (error: string | null) => void;
  setFormErrors: (formErrors: Record<string, string>) => void;
  setSaveLoading: (saveLoading: boolean) => void;
  clearFormState: () => void;
  setWebSearchActive: (isActive: boolean) => void;
  setWebSearchSearching: (isSearching: boolean) => void;
  setWebSearchStatusMessage: (statusMessage: string) => void;
  setWebSearchEnabled: (enabled: boolean) => void;
  toggleWebSearch: () => void;
  setPrivacyModeActive: (isActive: boolean) => void;
  setPrivacyModeEnabled: (enabled: boolean) => void;
  togglePrivacyMode: () => void;
  setUseFeatureIcons: (useFeatureIcons: boolean) => void;
  setAttachedFiles: (attachedFiles: File[]) => void;
  addAttachedFile: (file: File) => void;
  removeAttachedFile: (fileIndex: number) => void;
  clearAttachedFiles: () => void;
  setUploadedImage: (uploadedImage: string | null) => void;
  clearUploadedImage: () => void;
  setFormVisible: (isFormVisible: boolean) => void;
  toggleFormVisibility: () => void;
  resetFormState: () => void;
  getFormSubmissionState: () => FormSubmissionState;
  getFeatureState: () => FeatureState;
  getFileState: () => FileState;
}

type FormStateStore = FormStateState & FormStateActions;

/**
 * Zustand store for form state management across BaseForm and its children
 * Reduces prop drilling by centralizing transient form state
 */
const useFormStateStore = create<FormStateStore>()(
  subscribeWithSelector((set, get) => ({
    // Form submission state
    loading: false,
    success: false,
    error: null,
    formErrors: {},
    saveLoading: false,

    // Feature toggles
    webSearchConfig: {
      isActive: false,
      isSearching: false,
      statusMessage: '',
      enabled: false
    },
    privacyModeConfig: {
      isActive: false,
      enabled: false
    },

    // Feature presentation mode
    useFeatureIcons: false,

    // File attachments
    attachedFiles: [],
    uploadedImage: null,

    // Form visibility state
    isFormVisible: true,
    isStartMode: false,

    // Actions for form submission state
    setLoading: (loading) => set({ loading }),
    setSuccess: (success) => set({ success }),
    setError: (error) => set({ error }),
    setFormErrors: (formErrors) => set({ formErrors }),
    setSaveLoading: (saveLoading) => set({ saveLoading }),

    // Clear all form state
    clearFormState: () => set({
      loading: false,
      success: false,
      error: null,
      formErrors: {},
      saveLoading: false
    }),

    // Actions for web search
    setWebSearchActive: (isActive) => 
      set((state) => ({
        webSearchConfig: {
          ...state.webSearchConfig,
          isActive
        }
      })),
    
    setWebSearchSearching: (isSearching) =>
      set((state) => ({
        webSearchConfig: {
          ...state.webSearchConfig,
          isSearching
        }
      })),

    setWebSearchStatusMessage: (statusMessage) =>
      set((state) => ({
        webSearchConfig: {
          ...state.webSearchConfig,
          statusMessage
        }
      })),

    setWebSearchEnabled: (enabled) =>
      set((state) => ({
        webSearchConfig: {
          ...state.webSearchConfig,
          enabled
        }
      })),

    toggleWebSearch: () =>
      set((state) => ({
        webSearchConfig: {
          ...state.webSearchConfig,
          isActive: !state.webSearchConfig.isActive
        }
      })),

    // Actions for privacy mode
    setPrivacyModeActive: (isActive) => 
      set((state) => ({
        privacyModeConfig: {
          ...state.privacyModeConfig,
          isActive
        }
      })),

    setPrivacyModeEnabled: (enabled) =>
      set((state) => ({
        privacyModeConfig: {
          ...state.privacyModeConfig,
          enabled
        }
      })),

    togglePrivacyMode: () =>
      set((state) => ({
        privacyModeConfig: {
          ...state.privacyModeConfig,
          isActive: !state.privacyModeConfig.isActive
        }
      })),

    // Actions for feature presentation
    setUseFeatureIcons: (useFeatureIcons) => set({ useFeatureIcons }),

    // Actions for file attachments
    setAttachedFiles: (attachedFiles) => set({ attachedFiles }),
    addAttachedFile: (file) => 
      set((state) => ({
        attachedFiles: [...state.attachedFiles, file]
      })),
    removeAttachedFile: (fileIndex) =>
      set((state) => ({
        attachedFiles: state.attachedFiles.filter((_, index) => index !== fileIndex)
      })),
    clearAttachedFiles: () => set({ attachedFiles: [] }),

    setUploadedImage: (uploadedImage) => set({ uploadedImage }),
    clearUploadedImage: () => set({ uploadedImage: null }),

    // Actions for form visibility
    setFormVisible: (isFormVisible) => set({ isFormVisible }),
    toggleFormVisibility: () => set((state) => ({ isFormVisible: !state.isFormVisible })),

    // Reset all form state to initial values
    resetFormState: () => set({
      loading: false,
      success: false,
      error: null,
      formErrors: {},
      saveLoading: false,
      webSearchConfig: {
        isActive: false,
        isSearching: false,
        statusMessage: '',
        enabled: false
      },
      privacyModeConfig: {
        isActive: false,
        enabled: false
      },
      useFeatureIcons: false,
      attachedFiles: [],
      uploadedImage: null,
      isFormVisible: true,
      isStartMode: false
    }),

    // Helper selectors
    getFormSubmissionState: () => {
      const state = get();
      return {
        loading: state.loading,
        success: state.success,
        error: state.error,
        formErrors: state.formErrors,
        saveLoading: state.saveLoading
      };
    },

    getFeatureState: () => {
      const state = get();
      return {
        webSearchConfig: state.webSearchConfig,
        privacyModeConfig: state.privacyModeConfig,
        useFeatureIcons: state.useFeatureIcons
      };
    },

    getFileState: () => {
      const state = get();
      return {
        attachedFiles: state.attachedFiles,
        uploadedImage: state.uploadedImage
      };
    }
  }))
);

export default useFormStateStore;