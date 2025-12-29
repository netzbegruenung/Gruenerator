import { create, StateCreator } from 'zustand';

export interface ChatMessage {
  type: 'user' | 'assistant' | 'error';
  content: string;
  timestamp: number;
  isEditResult?: boolean;
  editSummary?: string;
}

export interface GeneratedTextMetadata {
  title?: string;
  contentType?: string;
  citations?: Array<{ index: number | string; url?: string; title?: string }>;
  enrichmentSummary?: string;
}

export interface GeneratedTextState {
  generatedTexts: Record<string, string>;
  generatedTextMetadata: Record<string, GeneratedTextMetadata>;
  editChats: Record<string, ChatMessage[]>;
  history: Record<string, string[]>;
  historyIndex: Record<string, number>;
  isLoading: boolean;
  isStreaming: boolean;
  maxHistorySize: number;
}

export interface GeneratedTextActions {
  getGeneratedText: (componentName: string) => string;
  getGeneratedTextMetadata: (componentName: string) => GeneratedTextMetadata | null;
  setGeneratedText: (componentName: string, text: string, metadata?: GeneratedTextMetadata | null) => void;
  setTextWithHistory: (componentName: string, text: string, metadata?: GeneratedTextMetadata | null) => void;
  setGeneratedTextMetadata: (componentName: string, metadata: GeneratedTextMetadata) => void;
  clearGeneratedText: (componentName: string) => void;
  clearAllGeneratedTexts: () => void;
  setIsLoading: (loading: boolean) => void;
  setIsStreaming: (streaming: boolean) => void;
  getEditChat: (componentName: string) => ChatMessage[];
  setEditChat: (componentName: string, messages: ChatMessage[]) => void;
  clearEditChat: (componentName: string) => void;
  updateText: (componentName: string, text: string) => void;
  pushToHistory: (componentName: string) => void;
  undo: (componentName: string) => void;
  redo: (componentName: string) => void;
  canUndo: (componentName: string) => boolean;
  canRedo: (componentName: string) => boolean;
  clearHistory: (componentName: string) => void;
}

export type GeneratedTextStore = GeneratedTextState & GeneratedTextActions;

const DEFAULT_STATE: GeneratedTextState = {
  generatedTexts: {},
  generatedTextMetadata: {},
  editChats: {},
  history: {},
  historyIndex: {},
  isLoading: false,
  isStreaming: false,
  maxHistorySize: 50,
};

const createGeneratedTextSlice: StateCreator<GeneratedTextStore> = (set, get) => ({
  ...DEFAULT_STATE,

  getGeneratedText: (componentName) => {
    return get().generatedTexts[componentName] || '';
  },

  getGeneratedTextMetadata: (componentName) => {
    return get().generatedTextMetadata[componentName] || null;
  },

  setGeneratedText: (componentName, text, metadata = null) => {
    set((state) => {
      const newState: Partial<GeneratedTextState> = {
        generatedTexts: {
          ...state.generatedTexts,
          [componentName]: text,
        },
      };

      if (metadata) {
        newState.generatedTextMetadata = {
          ...state.generatedTextMetadata,
          [componentName]: metadata,
        };
      }

      return newState as GeneratedTextState;
    });
  },

  setTextWithHistory: (componentName, text, metadata = null) => {
    if (text === undefined || text === '') return;

    set((state) => {
      const currentHistory = state.history[componentName] || [];
      const currentIndex = state.historyIndex[componentName] ?? -1;

      let newHistory: string[];
      let newIndex: number;

      if (currentIndex === -1 || currentIndex === currentHistory.length - 1) {
        newHistory = [...currentHistory, text].slice(-state.maxHistorySize);
      } else {
        newHistory = [...currentHistory.slice(0, currentIndex + 1), text].slice(-state.maxHistorySize);
      }

      newIndex = newHistory.length - 1;

      const newState: Partial<GeneratedTextState> = {
        generatedTexts: {
          ...state.generatedTexts,
          [componentName]: text,
        },
        history: {
          ...state.history,
          [componentName]: newHistory,
        },
        historyIndex: {
          ...state.historyIndex,
          [componentName]: newIndex,
        },
      };

      if (metadata) {
        newState.generatedTextMetadata = {
          ...state.generatedTextMetadata,
          [componentName]: metadata,
        };
      }

      return newState as GeneratedTextState;
    });
  },

  setGeneratedTextMetadata: (componentName, metadata) => {
    set((state) => ({
      generatedTextMetadata: {
        ...state.generatedTextMetadata,
        [componentName]: metadata,
      },
    }));
  },

  clearGeneratedText: (componentName) => {
    set((state) => ({
      generatedTexts: {
        ...state.generatedTexts,
        [componentName]: '',
      },
      generatedTextMetadata: {
        ...state.generatedTextMetadata,
        [componentName]: undefined as unknown as GeneratedTextMetadata,
      },
      editChats: {
        ...state.editChats,
        [componentName]: [],
      },
    }));
  },

  clearAllGeneratedTexts: () => {
    set({
      generatedTexts: {},
      generatedTextMetadata: {},
      editChats: {},
    });
  },

  setIsLoading: (loading) => set({ isLoading: loading }),

  setIsStreaming: (streaming) => set({ isStreaming: streaming }),

  getEditChat: (componentName) => {
    return get().editChats[componentName] || [];
  },

  setEditChat: (componentName, messages) => {
    set((state) => ({
      editChats: {
        ...state.editChats,
        [componentName]: messages,
      },
    }));
  },

  clearEditChat: (componentName) => {
    set((state) => ({
      editChats: {
        ...state.editChats,
        [componentName]: [],
      },
    }));
  },

  updateText: (componentName, text) => {
    set((state) => ({
      generatedTexts: {
        ...state.generatedTexts,
        [componentName]: text,
      },
    }));
  },

  pushToHistory: (componentName) => {
    set((state) => {
      const currentContent = state.generatedTexts[componentName];
      if (currentContent === undefined || currentContent === '') return state;

      const currentHistory = state.history[componentName] || [];
      const currentIndex = state.historyIndex[componentName] ?? -1;

      if (
        currentHistory.length > 0 &&
        currentIndex >= 0 &&
        currentHistory[currentIndex] === currentContent
      ) {
        return state;
      }

      let newHistory: string[];
      let newIndex: number;

      if (currentIndex === -1 || currentIndex === currentHistory.length - 1) {
        newHistory = [...currentHistory, currentContent].slice(-state.maxHistorySize);
      } else {
        newHistory = [...currentHistory.slice(0, currentIndex + 1), currentContent].slice(
          -state.maxHistorySize
        );
      }

      newIndex = newHistory.length - 1;

      return {
        ...state,
        history: {
          ...state.history,
          [componentName]: newHistory,
        },
        historyIndex: {
          ...state.historyIndex,
          [componentName]: newIndex,
        },
      };
    });
  },

  undo: (componentName) => {
    set((state) => {
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
          [componentName]: previousContent,
        },
        historyIndex: {
          ...state.historyIndex,
          [componentName]: newIndex,
        },
      };
    });
  },

  redo: (componentName) => {
    set((state) => {
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
          [componentName]: nextContent,
        },
        historyIndex: {
          ...state.historyIndex,
          [componentName]: newIndex,
        },
      };
    });
  },

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

  clearHistory: (componentName) => {
    set((state) => ({
      ...state,
      history: {
        ...state.history,
        [componentName]: [],
      },
      historyIndex: {
        ...state.historyIndex,
        [componentName]: 0,
      },
    }));
  },
});

export const useGeneratedTextStore = create<GeneratedTextStore>()(createGeneratedTextSlice);

export const getGeneratedTextState = (): GeneratedTextState => {
  const {
    generatedTexts,
    generatedTextMetadata,
    editChats,
    history,
    historyIndex,
    isLoading,
    isStreaming,
    maxHistorySize,
  } = useGeneratedTextStore.getState();
  return {
    generatedTexts,
    generatedTextMetadata,
    editChats,
    history,
    historyIndex,
    isLoading,
    isStreaming,
    maxHistorySize,
  };
};
