import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

const initialState = {
  source: { type: 'neutral', id: null, name: null },
  availableKnowledge: [],
  selectedKnowledgeIds: [],
  isLoading: false,
  // New: Instruction type context
  instructionType: null,
  // New: Instructions state
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
  // New: Documents state
  availableDocuments: [],
  selectedDocumentIds: [],
  isLoadingDocuments: false,
  isExtractingDocumentContent: false,
  documentExtractionInfo: null,
  // New: User texts state
  availableTexts: [],
  selectedTextIds: [],
  isLoadingTexts: false,
  // New: UI Configuration state
  uiConfig: {
    enableKnowledge: false,
    enableDocuments: false,
    enableTexts: false,
    enableSourceSelection: false
  },
};

/**
 * Zustand store to manage knowledge selection state within generators.
 * Now the single source of truth for all knowledge and instructions.
 */
export const useGeneratorKnowledgeStore = create(immer((set, get) => {
  // Store instance created
  
  return {
    ...initialState,

  setSource: (source) => set((state) => {
    // setSource called
    state.source = source;
    // Reset selections when source changes
    state.availableKnowledge = [];
    state.selectedKnowledgeIds = [];
    state.isLoading = !!source && source.type !== 'neutral';
    // Reset instructions when source changes
    state.instructions = { antrag: null, antragGliederung: null, social: null, universal: null, gruenejugend: null, rede: null, buergeranfragen: null };
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
  }),

  setAvailableKnowledge: (items) => set((state) => {
    // setAvailableKnowledge called
    state.availableKnowledge = items;
    state.isLoading = false;
  }),

  toggleSelection: (id) => {
    // Use setTimeout to batch multiple rapid toggles and reduce re-renders
    const currentState = get();
    const wasSelected = currentState.selectedKnowledgeIds.includes(id);
    
    set((state) => {
      if (wasSelected) {
        state.selectedKnowledgeIds = state.selectedKnowledgeIds.filter(selectedId => selectedId !== id);
        // toggleSelection: REMOVED
      } else {
        state.selectedKnowledgeIds.push(id);
        // toggleSelection: ADDED
      }
    });
  },
  
  setLoading: (isLoading) => set({ isLoading }),

  // New: Instructions management
  setInstructions: (instructions) => set((state) => {
    state.instructions = instructions;
  }),

  setInstructionsActive: (active) => set((state) => {
    state.isInstructionsActive = active;
  }),

  // New: Set instruction type context
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
      knowledgeIds: state.selectedKnowledgeIds,
      documentIds: state.selectedDocumentIds,
      textIds: state.selectedTextIds
    };
  },

  // New: Document management functions
  setAvailableDocuments: (documents) => set((state) => {
    // setAvailableDocuments called
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
    console.error('[KnowledgeStore] Document loading error:', error);
    state.isLoadingDocuments = false;
    state.isExtractingDocumentContent = false;
    state.documentExtractionInfo = null;
    // Keep existing documents if any
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
        // toggleDocumentSelection: REMOVED
      } else {
        state.selectedDocumentIds.push(documentId);
        // toggleDocumentSelection: ADDED
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

  // New: Text management functions
  setAvailableTexts: (texts) => set((state) => {
    // setAvailableTexts called
    state.availableTexts = texts || [];
    state.isLoadingTexts = false;
  }),

  setLoadingTexts: (isLoading) => set((state) => {
    state.isLoadingTexts = isLoading;
  }),

  // Helper: Handle text loading errors
  handleTextLoadError: (error) => set((state) => {
    console.error('[KnowledgeStore] Text loading error:', error);
    state.isLoadingTexts = false;
    // Keep existing texts if any
  }),

  toggleTextSelection: (textId) => {
    const currentState = get();
    const wasSelected = currentState.selectedTextIds.includes(textId);
    
    set((state) => {
      if (wasSelected) {
        state.selectedTextIds = state.selectedTextIds.filter(id => id !== textId);
        // toggleTextSelection: REMOVED
      } else {
        state.selectedTextIds.push(textId);
        // toggleTextSelection: ADDED
      }
    });
  },

  // Helper: Fetch user texts
  fetchTexts: async () => {
    const state = get();
    const { setLoadingTexts, setAvailableTexts, handleTextLoadError } = get();
    
    setLoadingTexts(true);
    
    try {
      // Fetching user texts
      
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
      console.error('[KnowledgeStore] Error fetching texts:', error);
      handleTextLoadError(error);
      setAvailableTexts([]); // Clear texts on error
    }
  },

  // Helper: Get selected texts for display
  getSelectedTexts: () => {
    const state = get();
    return state.availableTexts.filter(text => 
      state.selectedTextIds.includes(text.id)
    );
  },


  // New: UI Configuration management
  setUIConfig: (config) => set((state) => {
    const newConfig = { ...state.uiConfig, ...config };
    // setUIConfig called
    state.uiConfig = newConfig;
  }),

  reset: () => {
    // reset() called
    return set(initialState);
  },
  };
})); 