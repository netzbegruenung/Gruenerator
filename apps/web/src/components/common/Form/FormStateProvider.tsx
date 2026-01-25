import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

// =============================================================================
// Type Definitions
// =============================================================================

export interface WebSearchConfig {
  isActive: boolean;
  isSearching: boolean;
  statusMessage: string;
  enabled: boolean;
}

export interface PrivacyModeConfig {
  isActive: boolean;
  enabled: boolean;
}

export interface ProModeConfig {
  isActive: boolean;
  enabled: boolean;
}

export interface InteractiveModeConfig {
  isActive: boolean;
  enabled: boolean;
}

export interface FormStateStore {
  // Form submission state
  loading: boolean;
  success: boolean;
  error: string | null;
  formErrors: Record<string, string>;
  saveLoading: boolean;

  // Feature toggles
  webSearchConfig: WebSearchConfig;
  privacyModeConfig: PrivacyModeConfig;
  proModeConfig: ProModeConfig;
  interactiveModeConfig?: InteractiveModeConfig;

  // Feature presentation mode
  useFeatureIcons: boolean;

  // File attachments
  attachedFiles: unknown[];
  uploadedImage: unknown;

  // Form visibility state
  isFormVisible: boolean;

  // Start mode (centered layout before content generation)
  isStartMode: boolean;

  // Configuration sections
  tabIndexConfig: Record<string, number | undefined>;
  platformConfig: Record<string, unknown>;
  submitConfig: Record<string, unknown>;
  uiConfig: Record<string, unknown>;
  helpConfig: Record<string, unknown>;

  // Actions for form submission state
  setLoading: (loading: boolean) => void;
  setSuccess: (success: boolean) => void;
  setError: (error: string | null) => void;
  setFormErrors: (formErrors: Record<string, string>) => void;
  setSaveLoading: (saveLoading: boolean) => void;
  clearError: () => void;
  clearFormState: () => void;

  // Actions for web search
  setWebSearchActive: (isActive: boolean) => void;
  setWebSearchSearching: (isSearching: boolean) => void;
  setWebSearchStatusMessage: (statusMessage: string) => void;
  setWebSearchEnabled: (enabled: boolean) => void;
  toggleWebSearch: () => void;

  // Actions for privacy mode
  setPrivacyModeActive: (isActive: boolean) => void;
  setPrivacyModeEnabled: (enabled: boolean) => void;
  togglePrivacyMode: () => void;

  // Actions for pro mode
  setProModeActive: (isActive: boolean) => void;
  setProModeEnabled: (enabled: boolean) => void;
  toggleProMode: () => void;

  // Actions for feature presentation
  setUseFeatureIcons: (useFeatureIcons: boolean) => void;

  // Actions for file attachments
  setAttachedFiles: (attachedFiles: unknown[]) => void;
  addAttachedFile: (file: unknown) => void;
  removeAttachedFile: (fileIndex: number) => void;
  clearAttachedFiles: () => void;
  setUploadedImage: (uploadedImage: unknown) => void;
  clearUploadedImage: () => void;

  // Actions for form visibility
  setFormVisible: (isFormVisible: boolean) => void;
  toggleFormVisibility: () => void;

  // Actions for start mode
  setIsStartMode: (isStartMode: boolean) => void;

  // Actions for configuration sections
  setTabIndexConfig: (tabIndexConfig: Record<string, number | undefined>) => void;
  setPlatformConfig: (platformConfig: Record<string, unknown>) => void;
  setSubmitConfig: (submitConfig: Record<string, unknown>) => void;
  setUIConfig: (uiConfig: Record<string, unknown>) => void;
  setHelpConfig: (helpConfig: Record<string, unknown>) => void;

  // Merge configuration updates
  updateTabIndexConfig: (updates: Partial<Record<string, number | undefined>>) => void;
  updatePlatformConfig: (updates: Partial<Record<string, unknown>>) => void;
  updateSubmitConfig: (updates: Partial<Record<string, unknown>>) => void;
  updateUIConfig: (updates: Partial<Record<string, unknown>>) => void;
  updateHelpConfig: (updates: Partial<Record<string, unknown>>) => void;

  // Reset all form state
  resetFormState: () => void;

  // Helper selectors
  getFormSubmissionState: () => {
    loading: boolean;
    success: boolean;
    error: string | null;
    formErrors: Record<string, string>;
    saveLoading: boolean;
  };
  getFeatureState: () => {
    webSearchConfig: WebSearchConfig;
    privacyModeConfig: PrivacyModeConfig;
    proModeConfig: ProModeConfig;
    useFeatureIcons: boolean;
  };
  getFileState: () => {
    attachedFiles: unknown[];
    uploadedImage: unknown;
  };
  getConfigState: () => {
    tabIndexConfig: Record<string, number | undefined>;
    platformConfig: Record<string, unknown>;
    submitConfig: Record<string, unknown>;
    uiConfig: Record<string, unknown>;
    helpConfig: Record<string, unknown>;
  };
  getTabIndex: (key: string, fallback: number) => number;
  getPlatformConfig: <T>(key: string, fallback: T) => T;
  getSubmitConfig: <T>(key: string, fallback: T) => T;
  getUIConfig: <T>(key: string, fallback: T) => T;
  getHelpConfig: <T>(key: string, fallback: T) => T;
}

type FormStateStoreType = UseBoundStore<StoreApi<FormStateStore>>;

interface FormStateProviderProps {
  children: ReactNode;
  initialState?: Partial<FormStateStore>;
  formId?: string;
}

// Context for providing the form store instance
const FormStateContext = createContext<FormStateStoreType | null>(null);

/**
 * Creates a new form state store instance
 * Each form instance gets its own isolated store
 */
const createFormStateStore = (initialState: Partial<FormStateStore> = {}): FormStateStoreType => {
  return create<FormStateStore>()(
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
        enabled: false,
      },
      privacyModeConfig: {
        isActive: false,
        enabled: false,
      },
      proModeConfig: {
        isActive: false,
        enabled: true,
      },

      // Feature presentation mode
      useFeatureIcons: false,

      // File attachments
      attachedFiles: [],
      uploadedImage: null,

      // Form visibility state
      isFormVisible: true,

      // Start mode (centered layout before content generation)
      isStartMode: false,

      // Configuration sections (new, optional)
      tabIndexConfig: {},
      platformConfig: {},
      submitConfig: {},
      uiConfig: {},
      helpConfig: {},

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
      clearFormState: () =>
        set({
          loading: false,
          success: false,
          error: null,
          formErrors: {},
          saveLoading: false,
        }),

      // Actions for web search
      setWebSearchActive: (isActive) =>
        set((state) => ({
          webSearchConfig: {
            ...state.webSearchConfig,
            isActive,
          },
        })),

      setWebSearchSearching: (isSearching) =>
        set((state) => ({
          webSearchConfig: {
            ...state.webSearchConfig,
            isSearching,
          },
        })),

      setWebSearchStatusMessage: (statusMessage) =>
        set((state) => ({
          webSearchConfig: {
            ...state.webSearchConfig,
            statusMessage,
          },
        })),

      setWebSearchEnabled: (enabled) =>
        set((state) => ({
          webSearchConfig: {
            ...state.webSearchConfig,
            enabled,
          },
        })),

      toggleWebSearch: () =>
        set((state) => ({
          webSearchConfig: {
            ...state.webSearchConfig,
            isActive: !state.webSearchConfig.isActive,
          },
        })),

      // Actions for privacy mode
      setPrivacyModeActive: (isActive) =>
        set((state) => ({
          privacyModeConfig: {
            ...state.privacyModeConfig,
            isActive,
          },
        })),

      setPrivacyModeEnabled: (enabled) =>
        set((state) => ({
          privacyModeConfig: {
            ...state.privacyModeConfig,
            enabled,
          },
        })),

      togglePrivacyMode: () =>
        set((state) => ({
          privacyModeConfig: {
            ...state.privacyModeConfig,
            isActive: !state.privacyModeConfig.isActive,
          },
        })),

      // Actions for pro mode
      setProModeActive: (isActive) =>
        set((state) => ({
          proModeConfig: {
            ...state.proModeConfig,
            isActive,
          },
        })),

      setProModeEnabled: (enabled) =>
        set((state) => ({
          proModeConfig: {
            ...state.proModeConfig,
            enabled,
          },
        })),

      toggleProMode: () =>
        set((state) => ({
          proModeConfig: {
            ...state.proModeConfig,
            isActive: !state.proModeConfig.isActive,
          },
        })),

      // Actions for feature presentation
      setUseFeatureIcons: (useFeatureIcons) => set({ useFeatureIcons }),

      // Actions for file attachments
      setAttachedFiles: (attachedFiles) => set({ attachedFiles }),
      addAttachedFile: (file) =>
        set((state) => ({
          attachedFiles: [...state.attachedFiles, file],
        })),
      removeAttachedFile: (fileIndex) =>
        set((state) => ({
          attachedFiles: state.attachedFiles.filter((_, index) => index !== fileIndex),
        })),
      clearAttachedFiles: () => set({ attachedFiles: [] }),

      setUploadedImage: (uploadedImage) => set({ uploadedImage }),
      clearUploadedImage: () => set({ uploadedImage: null }),

      // Actions for form visibility
      setFormVisible: (isFormVisible) => set({ isFormVisible }),
      toggleFormVisibility: () => set((state) => ({ isFormVisible: !state.isFormVisible })),

      // Actions for start mode
      setIsStartMode: (isStartMode) => set({ isStartMode }),

      // Actions for configuration sections
      setTabIndexConfig: (tabIndexConfig) => set({ tabIndexConfig }),
      setPlatformConfig: (platformConfig) => set({ platformConfig }),
      setSubmitConfig: (submitConfig) => set({ submitConfig }),
      setUIConfig: (uiConfig) => set({ uiConfig }),
      setHelpConfig: (helpConfig) => set({ helpConfig }),

      // Merge configuration updates (non-destructive)
      updateTabIndexConfig: (updates) =>
        set((state) => ({
          tabIndexConfig: { ...state.tabIndexConfig, ...updates },
        })),
      updatePlatformConfig: (updates) =>
        set((state) => ({
          platformConfig: { ...state.platformConfig, ...updates },
        })),
      updateSubmitConfig: (updates) =>
        set((state) => ({
          submitConfig: { ...state.submitConfig, ...updates },
        })),
      updateUIConfig: (updates) =>
        set((state) => ({
          uiConfig: { ...state.uiConfig, ...updates },
        })),
      updateHelpConfig: (updates) =>
        set((state) => ({
          helpConfig: { ...state.helpConfig, ...updates },
        })),

      // Reset all form state to initial values
      resetFormState: () =>
        set({
          loading: false,
          success: false,
          error: null,
          formErrors: {},
          saveLoading: false,
          webSearchConfig: {
            isActive: false,
            isSearching: false,
            statusMessage: '',
            enabled: false,
          },
          privacyModeConfig: {
            isActive: false,
            enabled: false,
          },
          proModeConfig: {
            isActive: false,
            enabled: true,
          },
          useFeatureIcons: false,
          attachedFiles: [],
          uploadedImage: null,
          isFormVisible: true,
          isStartMode: false,
          // Configuration sections reset to empty (preserve initial state if provided)
          tabIndexConfig: initialState.tabIndexConfig || {},
          platformConfig: initialState.platformConfig || {},
          submitConfig: initialState.submitConfig || {},
          uiConfig: initialState.uiConfig || {},
          helpConfig: initialState.helpConfig || {},
          ...initialState, // Reset to initial state, not defaults
        }),

      // Helper selectors
      getFormSubmissionState: () => {
        const state = get();
        return {
          loading: state.loading,
          success: state.success,
          error: state.error,
          formErrors: state.formErrors,
          saveLoading: state.saveLoading,
        };
      },

      getFeatureState: () => {
        const state = get();
        return {
          webSearchConfig: state.webSearchConfig,
          privacyModeConfig: state.privacyModeConfig,
          proModeConfig: state.proModeConfig,
          useFeatureIcons: state.useFeatureIcons,
        };
      },

      getFileState: () => {
        const state = get();
        return {
          attachedFiles: state.attachedFiles,
          uploadedImage: state.uploadedImage,
        };
      },

      // Helper selectors for configuration sections
      getConfigState: () => {
        const state = get();
        return {
          tabIndexConfig: state.tabIndexConfig,
          platformConfig: state.platformConfig,
          submitConfig: state.submitConfig,
          uiConfig: state.uiConfig,
          helpConfig: state.helpConfig,
        };
      },

      // Get specific config with fallback
      getTabIndex: (key, fallback) => {
        const state = get();
        return state.tabIndexConfig[key] ?? fallback;
      },

      getPlatformConfig: <T,>(key: string, fallback: T): T => {
        const state = get();
        return (state.platformConfig[key] as T) ?? fallback;
      },

      getSubmitConfig: <T,>(key: string, fallback: T): T => {
        const state = get();
        return (state.submitConfig[key] as T) ?? fallback;
      },

      getUIConfig: <T,>(key: string, fallback: T): T => {
        const state = get();
        return (state.uiConfig[key] as T) ?? fallback;
      },

      getHelpConfig: <T,>(key: string, fallback: T): T => {
        const state = get();
        return (state.helpConfig[key] as T) ?? fallback;
      },
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
export const FormStateProvider = ({
  children,
  initialState = {},
  formId = 'default',
}: FormStateProviderProps) => {
  // Create a unique store instance for this form
  const store = useMemo(() => {
    const storeInstance = createFormStateStore(initialState);

    // Add debug info in development
    if (process.env.NODE_ENV === 'development') {
      (storeInstance as FormStateStoreType & { formId?: string }).formId = formId;
    }

    return storeInstance;
  }, [formId]); // Only recreate if formId changes

  return <FormStateContext.Provider value={store}>{children}</FormStateContext.Provider>;
};

/**
 * Hook to access the form state store from within a FormStateProvider
 * @returns The form state store bound hook
 */
export const useFormState = (): FormStateStoreType => {
  const store = useContext(FormStateContext);

  if (!store) {
    throw new Error('useFormState must be used within a FormStateProvider');
  }

  return store;
};

/**
 * Hook to access specific form state selectors
 * @param selector - Function to select specific state from the store
 * @returns Selected state value with proper type inference
 */
export function useFormStateSelector<T>(selector: (state: FormStateStore) => T): T {
  const store = useFormState();
  return store(selector);
}

/**
 * Hook to access multiple form state values with shallow comparison
 * This prevents unnecessary re-renders when selecting multiple values
 * @param selector - Function that returns an object of selected values
 * @returns Selected state values with proper type inference
 *
 * @example
 * const { loading, success, error } = useFormStateSelectors(state => ({
 *   loading: state.loading,
 *   success: state.success,
 *   error: state.error
 * }));
 */
export function useFormStateSelectors<T>(selector: (state: FormStateStore) => T): T {
  const store = useFormState();
  return store(useShallow(selector));
}

// Re-export useShallow for convenience
export { useShallow };

export default FormStateProvider;
