import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export interface NotebookSource {
  title: string;
  url?: string;
  documentId?: string;
  snippet?: string;
  collectionName?: string;
  index?: number | string;
  cited_text?: string;
  similarity_score?: number;
  chunk_index?: number;
  collection_id?: string;
}

export interface NotebookChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'error';
  content: string;
  timestamp: number;
  sources?: NotebookSource[];
  citations?: NotebookSource[];
  isLoading?: boolean;
}

interface NotebookChatState {
  chats: Record<
    string,
    {
      messages: NotebookChatMessage[];
      lastUpdated: number;
    }
  >;
}

interface NotebookChatActions {
  getMessages: (notebookId: string) => NotebookChatMessage[];
  addMessage: (notebookId: string, message: NotebookChatMessage) => void;
  updateLastMessage: (notebookId: string, updates: Partial<NotebookChatMessage>) => void;
  clearMessages: (notebookId: string) => void;
  loadFromStorage: () => Promise<void>;
  saveToStorage: () => Promise<void>;
}

type NotebookChatStore = NotebookChatState & NotebookChatActions;

const STORAGE_KEY = '@notebook_chats';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export const useNotebookChatStore = create<NotebookChatStore>()((set, get) => ({
  chats: {},

  getMessages: (notebookId: string) => {
    const chat = get().chats[notebookId];
    if (!chat) return [];

    // Check if messages are too old
    if (Date.now() - chat.lastUpdated > MAX_AGE_MS) {
      get().clearMessages(notebookId);
      return [];
    }

    return chat.messages;
  },

  addMessage: (notebookId: string, message: NotebookChatMessage) => {
    set((state) => {
      const existingChat = state.chats[notebookId] || { messages: [], lastUpdated: Date.now() };
      return {
        chats: {
          ...state.chats,
          [notebookId]: {
            messages: [...existingChat.messages, message],
            lastUpdated: Date.now(),
          },
        },
      };
    });
    get().saveToStorage();
  },

  updateLastMessage: (notebookId: string, updates: Partial<NotebookChatMessage>) => {
    set((state) => {
      const chat = state.chats[notebookId];
      if (!chat || chat.messages.length === 0) return state;

      const messages = [...chat.messages];
      const lastIndex = messages.length - 1;
      messages[lastIndex] = { ...messages[lastIndex], ...updates };

      return {
        chats: {
          ...state.chats,
          [notebookId]: {
            messages,
            lastUpdated: Date.now(),
          },
        },
      };
    });
    get().saveToStorage();
  },

  clearMessages: (notebookId: string) => {
    set((state) => {
      const { [notebookId]: _, ...rest } = state.chats;
      return { chats: rest };
    });
    get().saveToStorage();
  },

  loadFromStorage: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Filter out expired chats
        const validChats: Record<string, { messages: NotebookChatMessage[]; lastUpdated: number }> =
          {};
        for (const [key, chat] of Object.entries(parsed)) {
          const typedChat = chat as { messages: NotebookChatMessage[]; lastUpdated: number };
          if (Date.now() - typedChat.lastUpdated < MAX_AGE_MS) {
            validChats[key] = typedChat;
          }
        }
        set({ chats: validChats });
      }
    } catch (error) {
      console.warn('[NotebookChatStore] Failed to load from storage:', error);
    }
  },

  saveToStorage: async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(get().chats));
    } catch (error) {
      console.warn('[NotebookChatStore] Failed to save to storage:', error);
    }
  },
}));
