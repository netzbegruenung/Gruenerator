import { create } from 'zustand';

const useGeneratedTextStore = create((set, get) => ({
  // Store generated text by component/generator type
  generatedTexts: {},
  // Store metadata (like sources) by component type
  generatedTextMetadata: {},
  // Store Quill instances by component type (replacing FormContext quillRef)
  quillInstances: {},
  // Global loading state
  isLoading: false,
  // Streaming state for real-time updates
  isStreaming: false,
  
  // History management for undo/redo functionality
  history: {}, // { componentName: [states...] }
  historyIndex: {}, // { componentName: currentIndex }
  maxHistorySize: 50, // Configurable history limit
  
  // Get generated text for a specific component
  getGeneratedText: (componentName) => {
    const state = get();
    const content = state.generatedTexts[componentName] || '';
    
    // Debug logging for mixed content retrieval
    if (process.env.NODE_ENV === 'development' && content) {
      const isMixedContent = content && typeof content === 'object' && (content.sharepic || content.social);
      console.log('[generatedTextStore] getGeneratedText:', {
        componentName,
        contentType: typeof content,
        isMixedContent,
        hasSharepic: !!(content && typeof content === 'object' && content.sharepic),
        hasSocial: !!(content && typeof content === 'object' && content.social),
        contentLength: typeof content === 'string' ? content.length : 'object'
      });
    }
    
    return content;
  },
  
  // Get metadata for a specific component
  getGeneratedTextMetadata: (componentName) => {
    const state = get();
    return state.generatedTextMetadata[componentName] || null;
  },
  
  // Set generated text for a specific component with history tracking
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
    
    // Get current content for history
    const currentContent = state.generatedTexts[componentName];
    const newState = { ...state };
    
    // Push to history if content is changing and not empty
    if (currentContent !== undefined && currentContent !== text && currentContent !== '') {
      const currentHistory = state.history[componentName] || [];
      const currentIndex = state.historyIndex[componentName] || -1;
      
      // Truncate future history if we're not at the end
      const newHistory = [...currentHistory.slice(0, currentIndex + 1), currentContent]
        .slice(-state.maxHistorySize);
      
      newState.history = {
        ...state.history,
        [componentName]: newHistory
      };
      newState.historyIndex = {
        ...state.historyIndex,
        [componentName]: newHistory.length - 1
      };
    }
    
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
    }
  })),
  
  // Clear all generated texts (if needed)
  clearAllGeneratedTexts: () => set({ generatedTexts: {}, generatedTextMetadata: {} }),
  
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
  
  // Direct text editing (replaces FormContext value/setValue)
  updateText: (componentName, text) => set((state) => {
    // Push current state to history before updating
    const currentContent = state.generatedTexts[componentName];
    const newState = { ...state };
    
    if (currentContent !== undefined && currentContent !== text) {
      newState.history = {
        ...state.history,
        [componentName]: [
          ...(state.history[componentName] || []).slice(0, (state.historyIndex[componentName] || -1) + 1),
          currentContent
        ].slice(-state.maxHistorySize)
      };
      newState.historyIndex = {
        ...state.historyIndex,
        [componentName]: Math.min(
          (newState.history[componentName]?.length || 1) - 1,
          state.maxHistorySize - 1
        )
      };
    }
    
    newState.generatedTexts = {
      ...state.generatedTexts,
      [componentName]: text
    };
    
    return newState;
  }),
  
  // History management actions
  pushToHistory: (componentName) => set((state) => {
    const currentContent = state.generatedTexts[componentName];
    if (currentContent === undefined) return state;
    
    const currentHistory = state.history[componentName] || [];
    const currentIndex = state.historyIndex[componentName] || -1;
    
    // Don't add duplicate entries
    if (currentHistory[currentIndex] === currentContent) return state;
    
    // Truncate future history if we're not at the end
    const newHistory = [...currentHistory.slice(0, currentIndex + 1), currentContent]
      .slice(-state.maxHistorySize);
    
    return {
      ...state,
      history: {
        ...state.history,
        [componentName]: newHistory
      },
      historyIndex: {
        ...state.historyIndex,
        [componentName]: newHistory.length - 1
      }
    };
  }),
  
  undo: (componentName) => set((state) => {
    const currentHistory = state.history[componentName];
    const currentIndex = state.historyIndex[componentName];
    
    if (!currentHistory || currentIndex <= 0) return state;
    
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
    const currentIndex = state.historyIndex[componentName];
    
    if (!currentHistory || currentIndex >= currentHistory.length - 1) return state;
    
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
    const currentIndex = state.historyIndex[componentName];
    return currentHistory && currentHistory.length > 0 && (currentIndex || 0) > 0;
  },
  
  canRedo: (componentName) => {
    const state = get();
    const currentHistory = state.history[componentName];
    const currentIndex = state.historyIndex[componentName] || 0;
    return currentHistory && currentIndex < currentHistory.length - 1;
  },
  
  clearHistory: (componentName) => set((state) => ({
    ...state,
    history: {
      ...state.history,
      [componentName]: []
    },
    historyIndex: {
      ...state.historyIndex,
      [componentName]: -1
    }
  })),

}));

export default useGeneratedTextStore; 