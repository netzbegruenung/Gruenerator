import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

/**
 * Zustand store for form state management across BaseForm and its children
 * Reduces prop drilling by centralizing transient form state
 * 
 * Note: This store is now primarily used as a template for FormStateProvider instances.
 * For most use cases, use FormStateProvider which creates isolated store instances
 * for each BaseForm to support multiple forms on the same page.
 * 
 * @see FormStateProvider - Component that creates isolated instances of this store
 */
const useFormStateStore = create(
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
      isFormVisible: true
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