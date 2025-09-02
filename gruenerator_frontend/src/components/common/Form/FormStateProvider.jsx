import React, { createContext, useContext, useMemo } from 'react';
import PropTypes from 'prop-types';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

// Context for providing the form store instance
const FormStateContext = createContext(null);

/**
 * Creates a new form state store instance
 * Each form instance gets its own isolated store
 */
const createFormStateStore = (initialState = {}) => {
  return create(
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

      // Override with any initial state
      ...initialState,

      // Actions for form submission state
      setLoading: (loading) => set({ loading }),
      setSuccess: (success) => set({ success }),
      setError: (error) => set({ error }),
      setFormErrors: (formErrors) => set({ formErrors }),
      setSaveLoading: (saveLoading) => set({ saveLoading }),

      // Clear only error state
      clearError: () => set({ error: null }),

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
        ...initialState // Reset to initial state, not defaults
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
};

/**
 * Provider component that creates an isolated form state store for each form instance
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 * @param {Object} props.initialState - Initial state for the form store
 * @param {string} props.formId - Unique identifier for this form instance (for debugging)
 */
export const FormStateProvider = ({ children, initialState = {}, formId = 'default' }) => {
  // Create a unique store instance for this form
  const store = useMemo(() => {
    const storeInstance = createFormStateStore(initialState);
    
    // Add debug info in development
    if (process.env.NODE_ENV === 'development') {
      storeInstance.formId = formId;
    }
    
    return storeInstance;
  }, [formId]); // Only recreate if formId changes

  return (
    <FormStateContext.Provider value={store}>
      {children}
    </FormStateContext.Provider>
  );
};

/**
 * Hook to access the form state store from within a FormStateProvider
 * @returns {Object} The form state store
 */
export const useFormState = () => {
  const store = useContext(FormStateContext);
  
  if (!store) {
    throw new Error('useFormState must be used within a FormStateProvider');
  }
  
  return store;
};

/**
 * Hook to access specific form state selectors
 * @param {Function} selector - Function to select specific state from the store
 * @returns {*} Selected state
 */
export const useFormStateSelector = (selector) => {
  const store = useFormState();
  return store(selector);
};

FormStateProvider.propTypes = {
  children: PropTypes.node.isRequired,
  initialState: PropTypes.object,
  formId: PropTypes.string
};

FormStateProvider.defaultProps = {
  initialState: {},
  formId: 'default'
};

export default FormStateProvider;