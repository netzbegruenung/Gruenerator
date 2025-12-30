import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

// Source types
interface Source {
  type: 'neutral' | 'user' | 'group';
  id: string | null;
  name: string | null;
}

// Instructions per generator type
interface Instructions {
  antrag: string | null;
  antragGliederung: string | null;
  social: string | null;
  universal: string | null;
  gruenejugend: string | null;
  rede: string | null;
  buergeranfragen: string | null;
  [key: string]: string | null;
}

// Document type
interface Document {
  id: string;
  [key: string]: any;
}

// Text type
interface Text {
  id: string;
  [key: string]: any;
}

// UI Configuration
interface UIConfig {
  enableDocuments: boolean;
  enableTexts: boolean;
  enableSourceSelection: boolean;
  [key: string]: boolean;
}

// Document extraction info
interface DocumentExtractionInfo {
  documentId?: string;
  progress?: number;
  message?: string;
  [key: string]: any;
}

// Default modes type
type DefaultMode = 'privacy' | 'pro' | 'ultra' | 'balanced';

// Feature state for backend
interface FeatureState {
  useWebSearchTool: boolean;
  usePrivacyMode: boolean;
  useProMode: boolean;
  useUltraMode: boolean;
  useAutomaticSearch: boolean;
  useBedrock: boolean;
}

// Selected IDs
interface SelectedIds {
  documentIds: string[];
  textIds: string[];
}

// Store state interface
interface GeneratorSelectionState {
  source: Source;
  instructionType: string | null;
  instructions: Instructions;
  isInstructionsActive: boolean;
  availableDocuments: Document[];
  selectedDocumentIds: string[];
  isLoadingDocuments: boolean;
  isExtractingDocumentContent: boolean;
  documentExtractionInfo: DocumentExtractionInfo | null;
  availableTexts: Text[];
  selectedTextIds: string[];
  isLoadingTexts: boolean;
  uiConfig: UIConfig;
  activeComponentName: string | null;
  defaultModes: Record<string, DefaultMode>;
  useWebSearch: boolean;
  usePrivacyMode: boolean;
  useProMode: boolean;
  useUltraMode: boolean;
  useAutomaticSearch: boolean;
}

// Store actions interface
interface GeneratorSelectionActions {
  setSource: (source: Source) => void;
  setInstructions: (instructions: Instructions) => void;
  setInstructionsActive: (active: boolean) => void;
  setInstructionType: (type: string | null) => void;
  getActiveInstruction: (type: string) => string | null;
  getSelectedIds: () => SelectedIds;
  setAvailableDocuments: (documents: Document[]) => void;
  setLoadingDocuments: (isLoading: boolean) => void;
  handleDocumentLoadError: (error: any) => void;
  setExtractingDocumentContent: (isExtracting: boolean, info?: DocumentExtractionInfo | null) => void;
  toggleDocumentSelection: (documentId: string) => void;
  getSelectedDocuments: () => Document[];
  setAvailableTexts: (texts: Text[]) => void;
  setLoadingTexts: (isLoading: boolean) => void;
  handleTextLoadError: (error: any) => void;
  toggleTextSelection: (textId: string) => void;
  fetchTexts: () => Promise<void>;
  getSelectedTexts: () => Text[];
  setUIConfig: (config: Partial<UIConfig>) => void;
  setActiveComponent: (componentName: string | null, defaultMode?: DefaultMode | null) => void;
  setWebSearch: (enabled: boolean) => void;
  setPrivacyMode: (enabled: boolean) => void;
  setProMode: (enabled: boolean) => void;
  setUltraMode: (enabled: boolean) => void;
  toggleWebSearch: () => void;
  togglePrivacyMode: () => void;
  toggleProMode: () => void;
  toggleUltraMode: () => void;
  setAutomaticSearch: (enabled: boolean) => void;
  toggleAutomaticSearch: () => void;
  getFeatureState: () => FeatureState;
  resetFeatures: () => void;
  reset: () => void;
}

// Combined store type
type GeneratorSelectionStore = GeneratorSelectionState & GeneratorSelectionActions;

const initialState: GeneratorSelectionState = {
  source: { type: 'neutral', id: null, name: null },
  instructionType: null,
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
  availableDocuments: [],
  selectedDocumentIds: [],
  isLoadingDocuments: false,
  isExtractingDocumentContent: false,
  documentExtractionInfo: null,
  availableTexts: [],
  selectedTextIds: [],
  isLoadingTexts: false,
  uiConfig: {
    enableDocuments: false,
    enableTexts: false,
    enableSourceSelection: false
  },
  activeComponentName: null,
  defaultModes: {},
  useWebSearch: false,
  usePrivacyMode: false,
  useProMode: false,
  useUltraMode: false,
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
export const useGeneratorSelectionStore = create<GeneratorSelectionStore>()(
  immer((set, get) => ({
    ...initialState,

    setSource: (source) => set((state) => {
      state.source = source;
      state.isInstructionsActive = false;
      if (source.type === 'neutral') {
        state.availableDocuments = [];
        state.selectedDocumentIds = [];
        state.isLoadingDocuments = false;
        state.availableTexts = [];
        state.selectedTextIds = [];
        state.isLoadingTexts = false;
      }
      state.useWebSearch = false;
      state.usePrivacyMode = false;
      state.useProMode = false;
      state.useUltraMode = false;
      state.useAutomaticSearch = false;
    }),

    setInstructions: (instructions) => set((state) => {
      state.instructions = instructions;
    }),

    setInstructionsActive: (active) => set((state) => {
      state.isInstructionsActive = active;
    }),

    setInstructionType: (type) => set((state) => {
      state.instructionType = type;
    }),

    getActiveInstruction: (type) => {
      const state = get();
      if (!state.isInstructionsActive || !state.instructions) return null;
      return state.instructions[type] || null;
    },

    getSelectedIds: () => {
      const state = get();
      return {
        documentIds: state.selectedDocumentIds,
        textIds: state.selectedTextIds
      };
    },

    setAvailableDocuments: (documents) => set((state) => {
      state.availableDocuments = documents || [];
      state.isLoadingDocuments = false;
      state.isExtractingDocumentContent = false;
      state.documentExtractionInfo = null;
    }),

    setLoadingDocuments: (isLoading) => set((state) => {
      state.isLoadingDocuments = isLoading;
    }),

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

    getSelectedDocuments: () => {
      const state = get();
      return state.availableDocuments.filter(doc =>
        state.selectedDocumentIds.includes(doc.id)
      );
    },

    setAvailableTexts: (texts) => set((state) => {
      state.availableTexts = texts || [];
      state.isLoadingTexts = false;
    }),

    setLoadingTexts: (isLoading) => set((state) => {
      state.isLoadingTexts = isLoading;
    }),

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

    fetchTexts: async () => {
      const { setLoadingTexts, setAvailableTexts, handleTextLoadError } = get();

      setLoadingTexts(true);

      try {
        const AUTH_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || '/api';
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

    getSelectedTexts: () => {
      const state = get();
      return state.availableTexts.filter(text =>
        state.selectedTextIds.includes(text.id)
      );
    },

    setUIConfig: (config) => set((state) => {
      for (const key in config) {
        if ((state.uiConfig as any)[key] !== (config as any)[key]) {
          (state.uiConfig as any)[key] = (config as any)[key];
        }
      }
    }),

    setActiveComponent: (componentName, defaultMode = null) => {
      const currentState = get();

      if (currentState.activeComponentName !== componentName) {
        set((state) => {
          state.activeComponentName = componentName;

          if (defaultMode && componentName && !state.defaultModes[componentName]) {
            state.defaultModes[componentName] = defaultMode;
          }

          const modeToApply = (componentName && state.defaultModes[componentName]) || defaultMode || 'privacy';

          state.useWebSearch = false;
          state.usePrivacyMode = false;
          state.useProMode = false;
          state.useUltraMode = false;

          if (modeToApply === 'ultra') {
            state.useUltraMode = true;
          } else if (modeToApply === 'pro') {
            state.useProMode = true;
          } else if (modeToApply === 'privacy') {
            state.usePrivacyMode = true;
          }
        });
      }
    },

    setWebSearch: (enabled) => set((state) => {
      state.useWebSearch = enabled;
    }),

    setPrivacyMode: (enabled) => set((state) => {
      state.usePrivacyMode = enabled;
      if (enabled) {
        state.useProMode = false;
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

    setAutomaticSearch: (enabled) => set((state) => {
      state.useAutomaticSearch = enabled;
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
        if (newValue) {
          state.selectedDocumentIds = [];
          state.selectedTextIds = [];
        }
      });
    },

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

    resetFeatures: () => set((state) => {
      state.useWebSearch = false;
      state.usePrivacyMode = false;
      state.useProMode = false;
      state.useUltraMode = false;
      state.useAutomaticSearch = false;
    }),

    reset: () => {
      return set(() => initialState);
    },
  }))
);
