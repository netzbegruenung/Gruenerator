import { create } from 'zustand';

// Types matching backend API
interface EditChange {
  text_to_find?: string;
  replacement_text: string;
  full_replace?: boolean;
}

// AI edit entry stored in history
export interface AiEditEntry {
  id: string;
  documentId: string;
  instruction: string;
  changes: EditChange[];
  beforeContent: string;
  afterContent: string;
  timestamp: number;
  summary: string;
}

// Chat message for UI display
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  type?: 'success' | 'error';
  timestamp?: number;
}

interface AiEditStore {
  // Per-document history (following generatedTextStore pattern)
  history: Record<string, AiEditEntry[]>;
  historyIndex: Record<string, number>;
  maxHistorySize: number;

  // UI state
  isProcessing: Record<string, boolean>;
  error: Record<string, string | null>;
  isPanelOpen: Record<string, boolean>;

  // Chat history for UI
  chatMessages: Record<string, ChatMessage[]>;

  // Getters
  getHistory: (documentId: string) => AiEditEntry[];
  getCurrentIndex: (documentId: string) => number;
  canUndo: (documentId: string) => boolean;
  canRedo: (documentId: string) => boolean;
  getIsProcessing: (documentId: string) => boolean;
  getError: (documentId: string) => string | null;
  getIsPanelOpen: (documentId: string) => boolean;
  getChatMessages: (documentId: string) => ChatMessage[];

  // Actions (following generatedTextStore pattern)
  commitAiEdit: (documentId: string, entry: AiEditEntry) => void;
  undo: (documentId: string) => void;
  redo: (documentId: string) => void;
  jumpToHistory: (documentId: string, index: number) => void;
  clearHistory: (documentId: string) => void;

  // UI actions
  setProcessing: (documentId: string, processing: boolean) => void;
  setError: (documentId: string, error: string | null) => void;
  setPanelOpen: (documentId: string, open: boolean) => void;
  addChatMessage: (documentId: string, message: ChatMessage) => void;
  clearChatMessages: (documentId: string) => void;
}

export const useAiEditStore = create<AiEditStore>((set, get) => ({
  // State
  history: {},
  historyIndex: {},
  maxHistorySize: 50,
  isProcessing: {},
  error: {},
  isPanelOpen: {},
  chatMessages: {},

  // Getters
  getHistory: (documentId) => {
    const state = get();
    return state.history[documentId] || [];
  },

  getCurrentIndex: (documentId) => {
    const state = get();
    return state.historyIndex[documentId] ?? -1;
  },

  canUndo: (documentId) => {
    const state = get();
    const currentHistory = state.history[documentId];
    const currentIndex = state.historyIndex[documentId] ?? -1;
    return !!(currentHistory && currentHistory.length > 0 && currentIndex > 0);
  },

  canRedo: (documentId) => {
    const state = get();
    const currentHistory = state.history[documentId];
    const currentIndex = state.historyIndex[documentId] ?? -1;
    return !!(
      currentHistory &&
      currentHistory.length > 0 &&
      currentIndex < currentHistory.length - 1
    );
  },

  getIsProcessing: (documentId) => {
    const state = get();
    return state.isProcessing[documentId] || false;
  },

  getError: (documentId) => {
    const state = get();
    return state.error[documentId] || null;
  },

  getIsPanelOpen: (documentId) => {
    const state = get();
    return state.isPanelOpen[documentId] || false;
  },

  getChatMessages: (documentId) => {
    const state = get();
    return state.chatMessages[documentId] || [];
  },

  // Actions - following generatedTextStore pattern for history management
  commitAiEdit: (documentId, entry) =>
    set((state) => {
      const currentHistory = state.history[documentId] || [];
      const currentIndex = state.historyIndex[documentId] ?? -1;

      let newHistory: AiEditEntry[];
      let newIndex: number;

      if (currentIndex === -1 || currentIndex === currentHistory.length - 1) {
        // At the end, add new entry
        newHistory = [...currentHistory, entry].slice(-state.maxHistorySize);
      } else {
        // In the middle, truncate future and add new entry
        newHistory = [...currentHistory.slice(0, currentIndex + 1), entry].slice(
          -state.maxHistorySize
        );
      }

      newIndex = newHistory.length - 1;

      return {
        history: {
          ...state.history,
          [documentId]: newHistory,
        },
        historyIndex: {
          ...state.historyIndex,
          [documentId]: newIndex,
        },
      };
    }),

  undo: (documentId) =>
    set((state) => {
      const currentHistory = state.history[documentId];
      const currentIndex = state.historyIndex[documentId] ?? 0;

      if (!currentHistory || currentHistory.length === 0 || currentIndex <= 0) {
        return state;
      }

      return {
        historyIndex: {
          ...state.historyIndex,
          [documentId]: currentIndex - 1,
        },
      };
    }),

  redo: (documentId) =>
    set((state) => {
      const currentHistory = state.history[documentId];
      const currentIndex = state.historyIndex[documentId] ?? 0;

      if (
        !currentHistory ||
        currentHistory.length === 0 ||
        currentIndex >= currentHistory.length - 1
      ) {
        return state;
      }

      return {
        historyIndex: {
          ...state.historyIndex,
          [documentId]: currentIndex + 1,
        },
      };
    }),

  jumpToHistory: (documentId, index) =>
    set((state) => {
      const currentHistory = state.history[documentId];

      if (!currentHistory || index < 0 || index >= currentHistory.length) {
        return state;
      }

      return {
        historyIndex: {
          ...state.historyIndex,
          [documentId]: index,
        },
      };
    }),

  clearHistory: (documentId) =>
    set((state) => ({
      history: {
        ...state.history,
        [documentId]: [],
      },
      historyIndex: {
        ...state.historyIndex,
        [documentId]: -1,
      },
    })),

  // UI actions
  setProcessing: (documentId, processing) =>
    set((state) => ({
      isProcessing: {
        ...state.isProcessing,
        [documentId]: processing,
      },
    })),

  setError: (documentId, error) =>
    set((state) => ({
      error: {
        ...state.error,
        [documentId]: error,
      },
    })),

  setPanelOpen: (documentId, open) =>
    set((state) => ({
      isPanelOpen: {
        ...state.isPanelOpen,
        [documentId]: open,
      },
    })),

  addChatMessage: (documentId, message) =>
    set((state) => {
      const currentMessages = state.chatMessages[documentId] || [];
      return {
        chatMessages: {
          ...state.chatMessages,
          [documentId]: [...currentMessages, { ...message, timestamp: Date.now() }],
        },
      };
    }),

  clearChatMessages: (documentId) =>
    set((state) => ({
      chatMessages: {
        ...state.chatMessages,
        [documentId]: [],
      },
    })),
}));
