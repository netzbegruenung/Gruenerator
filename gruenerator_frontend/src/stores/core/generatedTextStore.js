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
  
  // Set generated text for a specific component
  setGeneratedText: (componentName, text) => set((state) => ({
    generatedTexts: {
      ...state.generatedTexts,
      [componentName]: text
    }
  })),
  
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
  updateText: (componentName, text) => set((state) => ({
    generatedTexts: {
      ...state.generatedTexts,
      [componentName]: text
    }
  })),
  
}));

export default useGeneratedTextStore; 