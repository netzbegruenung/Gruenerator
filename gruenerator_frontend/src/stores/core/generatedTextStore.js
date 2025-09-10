import { create } from 'zustand';

const useGeneratedTextStore = create((set, get) => ({
  // Store generated text by component/generator type
  generatedTexts: {},
  // Store metadata (like sources) by component type
  generatedTextMetadata: {},
  // Store Quill instances by component type (replacing FormContext quillRef)
  quillInstances: {},
  // Store edit mode chat history by component name
  editChats: {},
  // Global loading state
  isLoading: false,
  // Streaming state for real-time updates
  isStreaming: false,
  
  // History management for undo/redo functionality - unified stack approach
  history: {}, // { componentName: [state0, state1, ...currentState] } - all states including current
  historyIndex: {}, // { componentName: currentIndex } - 0-based index pointing to current position
  maxHistorySize: 50, // Configurable history limit
  
  // Get generated text for a specific component
  getGeneratedText: (componentName) => {
    const state = get();
    return state.generatedTexts[componentName] || '';
  },
  
  // Get metadata for a specific component
  getGeneratedTextMetadata: (componentName) => {
    const state = get();
    return state.generatedTextMetadata[componentName] || null;
  },
  
  // Set generated text for a specific component (without automatic history tracking)
  setGeneratedText: (componentName, text, metadata = null) => set((state) => {
    // Debug logging for mixed content
    if (process.env.NODE_ENV === 'development') {
      const isMixedContent = text && typeof text === 'object' && (text.sharepic || text.social);
      console.log('[generatedTextStore] setGeneratedText:', {
        componentName,
        contentType: typeof text,
        isMixedContent,
        hasSharepic: !!(text && typeof text === 'object' && text.sharepic),
        hasSocial: !!(text && typeof text === 'object' && text.social),
        contentLength: typeof text === 'string' ? text.length : 'object'
      });
    }
    
    const newState = { ...state };
    
    newState.generatedTexts = {
      ...state.generatedTexts,
      [componentName]: text // Store the full content (string or mixed object)
    };
    
    // Also set metadata if provided
    if (metadata) {
      newState.generatedTextMetadata = {
        ...state.generatedTextMetadata,
        [componentName]: metadata
      };
    }
    
    return newState;
  }),
  
  // Set text and add it to history (used after edits)
  setTextWithHistory: (componentName, text, metadata = null) => set((state) => {
    if (text === undefined || text === '') return state;
    
    const currentHistory = state.history[componentName] || [];
    const currentIndex = state.historyIndex[componentName] ?? -1;
    
    let newHistory;
    let newIndex;
    
    if (currentIndex === -1 || currentIndex === currentHistory.length - 1) {
      // We're at the end, add new state
      newHistory = [...currentHistory, text].slice(-state.maxHistorySize);
    } else {
      // We're in the middle, truncate future and add new state
      newHistory = [...currentHistory.slice(0, currentIndex + 1), text].slice(-state.maxHistorySize);
    }
    
    newIndex = newHistory.length - 1;
    
    const newState = {
      ...state,
      generatedTexts: {
        ...state.generatedTexts,
        [componentName]: text
      },
      history: {
        ...state.history,
        [componentName]: newHistory
      },
      historyIndex: {
        ...state.historyIndex,
        [componentName]: newIndex
      }
    };
    
    // Also set metadata if provided
    if (metadata) {
      newState.generatedTextMetadata = {
        ...state.generatedTextMetadata,
        [componentName]: metadata
      };
    }
    
    return newState;
  }),
  
  // Set metadata for a specific component (e.g., sources for ask feature)
  setGeneratedTextMetadata: (componentName, metadata) => set((state) => ({
    generatedTextMetadata: {
      ...state.generatedTextMetadata,
      [componentName]: metadata
    }
  })),

  // Get link configuration for a specific component type
  getLinkConfig: (componentName) => {
    const linkConfigs = {
      'ask': {
        type: 'vectorDocument',
        basePath: '/documents',
        linkKey: 'document_id',
        titleKey: 'document_title'
      },
      'ask-grundsatz': {
        type: 'vectorDocument',
        basePath: '/documents',
        linkKey: 'document_id',
        titleKey: 'document_title'
      },
      'qa': {
        type: 'vectorDocument',
        basePath: '/documents',
        linkKey: 'document_id',
        titleKey: 'document_title'
      },
      // Future components can add their own link configurations here
      'default': {
        type: 'none'
      }
    };
    return linkConfigs[componentName] || linkConfigs['default'];
  },
  
  // Clear generated text for a specific component
  clearGeneratedText: (componentName) => set((state) => ({
    generatedTexts: {
      ...state.generatedTexts,
      [componentName]: ''
    },
    generatedTextMetadata: {
      ...state.generatedTextMetadata,
      [componentName]: null
    },
    editChats: {
      ...state.editChats,
      [componentName]: []
    }
  })),
  
  // Clear all generated texts (if needed)
  clearAllGeneratedTexts: () => set({ generatedTexts: {}, generatedTextMetadata: {}, editChats: {} }),
  
  setIsLoading: (loading) => set({ isLoading: loading }),
  
  // Streaming state management
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  
  // Quill instance management (replaces FormContext quillRef functionality)
  setQuillInstance: (componentName, instance) => set((state) => ({
    quillInstances: {
      ...state.quillInstances,
      [componentName]: instance
    }
  })),
  
  getQuillInstance: (componentName) => {
    const state = get();
    return state.quillInstances[componentName] || null;
  },
  
  // Edit chat management
  getEditChat: (componentName) => {
    const state = get();
    return state.editChats[componentName] || [];
  },
  
  setEditChat: (componentName, messages) => set((state) => ({
    editChats: {
      ...state.editChats,
      [componentName]: messages
    }
  })),
  
  clearEditChat: (componentName) => set((state) => ({
    editChats: {
      ...state.editChats,
      [componentName]: []
    }
  })),
  
  // Direct text editing (replaces FormContext value/setValue) - without automatic history tracking
  updateText: (componentName, text) => set((state) => ({
    ...state,
    generatedTexts: {
      ...state.generatedTexts,
      [componentName]: text
    }
  })),
  
  // Push current state to history before making changes
  pushToHistory: (componentName) => set((state) => {
    const currentContent = state.generatedTexts[componentName];
    if (currentContent === undefined || currentContent === '') return state;
    
    const currentHistory = state.history[componentName] || [];
    const currentIndex = state.historyIndex[componentName] ?? -1;
    
    // Don't add duplicate entries
    if (currentHistory.length > 0 && 
        currentIndex >= 0 && 
        currentHistory[currentIndex] === currentContent) {
      return state;
    }
    
    let newHistory;
    let newIndex;
    
    if (currentIndex === -1 || currentIndex === currentHistory.length - 1) {
      // We're at the latest state, just add to history
      newHistory = [...currentHistory, currentContent].slice(-state.maxHistorySize);
    } else {
      // We're in the middle of history - truncate future states and add current
      newHistory = [...currentHistory.slice(0, currentIndex + 1), currentContent].slice(-state.maxHistorySize);
    }
    
    newIndex = newHistory.length - 1;
    
    return {
      ...state,
      history: {
        ...state.history,
        [componentName]: newHistory
      },
      historyIndex: {
        ...state.historyIndex,
        [componentName]: newIndex
      }
    };
  }),
  
  undo: (componentName) => set((state) => {
    const currentHistory = state.history[componentName];
    const currentIndex = state.historyIndex[componentName] ?? 0;
    
    if (!currentHistory || currentHistory.length <= 1 || currentIndex <= 0) {
      return state;
    }
    
    const newIndex = currentIndex - 1;
    const previousContent = currentHistory[newIndex];
    
    return {
      ...state,
      generatedTexts: {
        ...state.generatedTexts,
        [componentName]: previousContent
      },
      historyIndex: {
        ...state.historyIndex,
        [componentName]: newIndex
      }
    };
  }),
  
  redo: (componentName) => set((state) => {
    const currentHistory = state.history[componentName];
    const currentIndex = state.historyIndex[componentName] ?? 0;
    
    if (!currentHistory || currentHistory.length <= 1 || currentIndex >= currentHistory.length - 1) {
      return state;
    }
    
    const newIndex = currentIndex + 1;
    const nextContent = currentHistory[newIndex];
    
    return {
      ...state,
      generatedTexts: {
        ...state.generatedTexts,
        [componentName]: nextContent
      },
      historyIndex: {
        ...state.historyIndex,
        [componentName]: newIndex
      }
    };
  }),
  
  canUndo: (componentName) => {
    const state = get();
    const currentHistory = state.history[componentName];
    const currentIndex = state.historyIndex[componentName] ?? 0;
    
    return !!(currentHistory && currentHistory.length > 1 && currentIndex > 0);
  },
  
  canRedo: (componentName) => {
    const state = get();
    const currentHistory = state.history[componentName];
    const currentIndex = state.historyIndex[componentName] ?? 0;
    
    return !!(currentHistory && currentHistory.length > 1 && currentIndex < currentHistory.length - 1);
  },
  
  clearHistory: (componentName) => set((state) => ({
    ...state,
    history: {
      ...state.history,
      [componentName]: []
    },
    historyIndex: {
      ...state.historyIndex,
      [componentName]: 0
    }
  })),

}));

export default useGeneratedTextStore; 