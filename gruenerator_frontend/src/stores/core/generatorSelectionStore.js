import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

const initialState = {
  source: { type: 'neutral', id: null, name: null },
  // Instruction type context
  instructionType: null,
  // Instructions state
  instructions: {
    antrag: null,
    antragGliederung: null,
    social: null,
    universal: null,
    gruenejugend: null,
    rede: null,
    buergeranfragen: null
  },
  isInstructionsActive: false,
  // Documents selection state
  availableDocuments: [],
  selectedDocumentIds: [],
  isLoadingDocuments: false,
  isExtractingDocumentContent: false,
  documentExtractionInfo: null,
  // User texts selection state
  availableTexts: [],
  selectedTextIds: [],
  isLoadingTexts: false,
  // UI Configuration state
  uiConfig: {
    enableDocuments: false,
    enableTexts: false,
    enableSourceSelection: false
  },
  // Component tracking for default modes
  activeComponentName: null,
  defaultModes: {},
  // Feature toggles state
  useWebSearch: false,
  usePrivacyMode: false,
  useProMode: false,
  useUltraMode: false,
  // Automatic search mode
  useAutomaticSearch: false,
};

/**
 * Zustand store to manage content selection and features within generators.
 *
 * Purpose:
 * - Track which documents/texts are selected for the current generation
 * - Manage feature toggles (web search, privacy mode, pro mode)
 * - Handle instruction source selection (user/group/neutral)
 * - Configure UI visibility settings
 *
 * Note: This is ephemeral UI state that resets when components unmount.
 * For document/text CRUD operations, use documentsStore instead.
 */
export const useGeneratorSelectionStore = create(immer((set, get) => {
  return {
    ...initialState,

  setSource: (source) => set((state) => {
    state.source = source;
    // Reset selections when source changes
    state.isInstructionsActive = false;
    // Reset documents when source changes (documents are user-scoped, not source-scoped)
    // Only clear if switching to neutral to avoid unnecessary reloads
    if (source.type === 'neutral') {
      state.availableDocuments = [];
      state.selectedDocumentIds = [];
      state.isLoadingDocuments = false;
      state.availableTexts = [];
      state.selectedTextIds = [];
      state.isLoadingTexts = false;
    }
    // Reset feature toggles when source changes (fresh state for each context)
    state.useWebSearch = false;
    state.usePrivacyMode = false;
    state.useProMode = false;
    state.useUltraMode = false;
    state.useAutomaticSearch = false;
  }),

  // Instructions management
  setInstructions: (instructions) => set((state) => {
    state.instructions = instructions;
  }),

  setInstructionsActive: (active) => set((state) => {
    state.isInstructionsActive = active;
  }),

  // Set instruction type context
  setInstructionType: (type) => set((state) => {
    state.instructionType = type;
  }),

  // Helper: Get active instruction for current context
  getActiveInstruction: (type) => {
    const state = get();
    if (!state.isInstructionsActive || !state.instructions) return null;
    return state.instructions[type] || null;
  },

  // Helper: Get selected IDs for backend submission
  getSelectedIds: () => {
    const state = get();
    return {
      documentIds: state.selectedDocumentIds,
      textIds: state.selectedTextIds
    };
  },

  // Document management functions
  setAvailableDocuments: (documents) => set((state) => {
    state.availableDocuments = documents || [];
    state.isLoadingDocuments = false;
    // Clear any extraction status when documents change
    state.isExtractingDocumentContent = false;
    state.documentExtractionInfo = null;
  }),

  setLoadingDocuments: (isLoading) => set((state) => {
    state.isLoadingDocuments = isLoading;
  }),

  // Helper: Handle document loading errors
  handleDocumentLoadError: (error) => set((state) => {
    console.error('[SelectionStore] Document loading error:', error);
    state.isLoadingDocuments = false;
    state.isExtractingDocumentContent = false;
    state.documentExtractionInfo = null;
  }),

  setExtractingDocumentContent: (isExtracting, info = null) => set((state) => {
    state.isExtractingDocumentContent = isExtracting;
    state.documentExtractionInfo = info;
  }),

  toggleDocumentSelection: (documentId) => {
    const currentState = get();
    const wasSelected = currentState.selectedDocumentIds.includes(documentId);

    set((state) => {
      if (wasSelected) {
        state.selectedDocumentIds = state.selectedDocumentIds.filter(id => id !== documentId);
      } else {
        state.selectedDocumentIds.push(documentId);
      }
    });
  },

  // Helper: Get selected documents for display
  getSelectedDocuments: () => {
    const state = get();
    return state.availableDocuments.filter(doc =>
      state.selectedDocumentIds.includes(doc.id)
    );
  },

  // Text management functions
  setAvailableTexts: (texts) => set((state) => {
    state.availableTexts = texts || [];
    state.isLoadingTexts = false;
  }),

  setLoadingTexts: (isLoading) => set((state) => {
    state.isLoadingTexts = isLoading;
  }),

  // Helper: Handle text loading errors
  handleTextLoadError: (error) => set((state) => {
    console.error('[SelectionStore] Text loading error:', error);
    state.isLoadingTexts = false;
  }),

  toggleTextSelection: (textId) => {
    const currentState = get();
    const wasSelected = currentState.selectedTextIds.includes(textId);

    set((state) => {
      if (wasSelected) {
        state.selectedTextIds = state.selectedTextIds.filter(id => id !== textId);
      } else {
        state.selectedTextIds.push(textId);
      }
    });
  },

  // Helper: Fetch user texts
  fetchTexts: async () => {
    const { setLoadingTexts, setAvailableTexts, handleTextLoadError } = get();

    setLoadingTexts(true);

    try {
      const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
      const response = await fetch(`${AUTH_BASE_URL}/auth/saved-texts`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        setAvailableTexts(result.data || []);
      } else {
        throw new Error(result.message || 'Failed to fetch texts');
      }
    } catch (error) {
      console.error('[SelectionStore] Error fetching texts:', error);
      handleTextLoadError(error);
      setAvailableTexts([]);
    }
  },

  // Helper: Get selected texts for display
  getSelectedTexts: () => {
    const state = get();
    return state.availableTexts.filter(text =>
      state.selectedTextIds.includes(text.id)
    );
  },

  // UI Configuration management
  setUIConfig: (config) => set((state) => {
    // Only update properties that have actually changed (prevents infinite loops)
    for (const key in config) {
      if (state.uiConfig[key] !== config[key]) {
        state.uiConfig[key] = config[key];
      }
    }
    // If no changes, immer will not trigger subscribers
  }),

  // Component tracking and default mode management
  setActiveComponent: (componentName, defaultMode = null) => {
    const currentState = get();

    // If switching to a new component
    if (currentState.activeComponentName !== componentName) {
      set((state) => {
        // Update active component
        state.activeComponentName = componentName;

        // Store the default mode for this component if provided
        if (defaultMode && !state.defaultModes[componentName]) {
          state.defaultModes[componentName] = defaultMode;
        }

        // Reset features to the component's default
        const modeToApply = state.defaultModes[componentName] || defaultMode || 'balanced';

        // Reset all modes first
        state.useWebSearch = false;
        state.usePrivacyMode = false;
        state.useProMode = false;
        state.useUltraMode = false;

        // Apply the appropriate default
        if (modeToApply === 'ultra') {
          state.useUltraMode = true;
        } else if (modeToApply === 'pro') {
          state.useProMode = true;
        } else if (modeToApply === 'privacy') {
          state.usePrivacyMode = true;
        }
        // 'balanced' = all false (already reset above)
      });
    }
  },

  // Feature toggle management
  setWebSearch: (enabled) => set((state) => {
    state.useWebSearch = enabled;
  }),

  setPrivacyMode: (enabled) => set((state) => {
    state.usePrivacyMode = enabled;
    if (enabled) {
      state.useProMode = false; // Mutual exclusivity
    }
  }),

  setProMode: (enabled) => set((state) => {
    state.useProMode = enabled;
    if (enabled) {
      state.usePrivacyMode = false;
      state.useUltraMode = false;
    }
  }),

  setUltraMode: (enabled) => set((state) => {
    state.useUltraMode = enabled;
    if (enabled) {
      state.usePrivacyMode = false;
      state.useProMode = false;
    }
  }),

  toggleWebSearch: () => set((state) => {
    state.useWebSearch = !state.useWebSearch;
  }),

  togglePrivacyMode: () => set((state) => {
    state.usePrivacyMode = !state.usePrivacyMode;
    if (state.usePrivacyMode) {
      state.useProMode = false;
    }
  }),

  toggleProMode: () => set((state) => {
    state.useProMode = !state.useProMode;
    if (state.useProMode) {
      state.usePrivacyMode = false;
      state.useUltraMode = false;
    }
  }),

  toggleUltraMode: () => set((state) => {
    state.useUltraMode = !state.useUltraMode;
    if (state.useUltraMode) {
      state.usePrivacyMode = false;
      state.useProMode = false;
    }
  }),

  // Automatic search toggle
  setAutomaticSearch: (enabled) => set((state) => {
    state.useAutomaticSearch = enabled;
    // When enabling auto-search, clear manual selections (priority rule)
    if (enabled) {
      state.selectedDocumentIds = [];
      state.selectedTextIds = [];
    }
  }),

  toggleAutomaticSearch: () => {
    const currentState = get();
    const newValue = !currentState.useAutomaticSearch;

    set((state) => {
      state.useAutomaticSearch = newValue;
      // When enabling auto-search, clear manual selections (priority rule)
      if (newValue) {
        state.selectedDocumentIds = [];
        state.selectedTextIds = [];
      }
    });
  },

  // Helper: Get feature state for backend submission
  getFeatureState: () => {
    const state = get();
    return {
      useWebSearchTool: state.useWebSearch,
      usePrivacyMode: state.usePrivacyMode,
      useProMode: state.useProMode,
      useUltraMode: state.useUltraMode,
      useAutomaticSearch: state.useAutomaticSearch,
      useBedrock: state.useUltraMode,
    };
  },

  // Reset feature toggles
  resetFeatures: () => set((state) => {
    state.useWebSearch = false;
    state.usePrivacyMode = false;
    state.useProMode = false;
    state.useUltraMode = false;
    state.useAutomaticSearch = false;
  }),

  reset: () => {
    return set(initialState);
  },
  };
}));
