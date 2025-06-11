import { create } from 'zustand';

const useGeneratedTextStore = create((set) => ({
  generatedText: '',
  isLoading: false,
  
  setGeneratedText: (text) => set({ generatedText: text }),
  clearGeneratedText: () => set({ generatedText: '' }),
  setIsLoading: (loading) => set({ isLoading: loading }),
}));

export default useGeneratedTextStore; 