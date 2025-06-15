import { create } from 'zustand';

const useGeneratedTextStore = create((set, get) => ({
  // Store generated text by component/generator type
  generatedTexts: {},
  isLoading: false,
  
  // Get generated text for a specific component
  getGeneratedText: (componentName) => {
    const state = get();
    return state.generatedTexts[componentName] || '';
  },
  
  // Set generated text for a specific component
  setGeneratedText: (componentName, text) => set((state) => ({
    generatedTexts: {
      ...state.generatedTexts,
      [componentName]: text
    }
  })),
  
  // Clear generated text for a specific component
  clearGeneratedText: (componentName) => set((state) => ({
    generatedTexts: {
      ...state.generatedTexts,
      [componentName]: ''
    }
  })),
  
  // Clear all generated texts (if needed)
  clearAllGeneratedTexts: () => set({ generatedTexts: {} }),
  
  setIsLoading: (loading) => set({ isLoading: loading }),
}));

export default useGeneratedTextStore; 