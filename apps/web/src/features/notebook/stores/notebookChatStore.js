import { create } from 'zustand';

const QA_CHAT_STORAGE_KEY = 'gruenerator_qa_chat_state';
const QA_CHAT_CACHE_VERSION = '1.0';
const QA_CHAT_VERSION_KEY = 'gruenerator_qa_chat_version';
const QA_CHAT_EXPIRY_TIME = 24 * 60 * 60 * 1000; // 24 hours

const loadPersistedNotebookChatState = () => {
  try {
    const storedVersion = localStorage.getItem(QA_CHAT_VERSION_KEY);
    if (storedVersion !== QA_CHAT_CACHE_VERSION) {
      localStorage.removeItem(QA_CHAT_STORAGE_KEY);
      localStorage.setItem(QA_CHAT_VERSION_KEY, QA_CHAT_CACHE_VERSION);
      return null;
    }

    const stored = localStorage.getItem(QA_CHAT_STORAGE_KEY);
    if (stored) {
      const { chats, timestamp, cacheVersion } = JSON.parse(stored);

      if (cacheVersion !== QA_CHAT_CACHE_VERSION) {
        localStorage.removeItem(QA_CHAT_STORAGE_KEY);
        return null;
      }

      if (timestamp && Date.now() - timestamp < QA_CHAT_EXPIRY_TIME) {
        return { chats: chats || {} };
      } else {
        localStorage.removeItem(QA_CHAT_STORAGE_KEY);
      }
    }
  } catch (error) {
    console.warn('[NotebookChatStore] Error loading persisted state:', error);
    localStorage.removeItem(QA_CHAT_STORAGE_KEY);
    localStorage.removeItem(QA_CHAT_VERSION_KEY);
  }
  return null;
};

const persistNotebookChatState = (chats) => {
  try {
    const dataToStore = {
      chats,
      timestamp: Date.now(),
      cacheVersion: QA_CHAT_CACHE_VERSION,
    };

    localStorage.setItem(QA_CHAT_STORAGE_KEY, JSON.stringify(dataToStore));
    localStorage.setItem(QA_CHAT_VERSION_KEY, QA_CHAT_CACHE_VERSION);
  } catch (error) {
    console.warn('[NotebookChatStore] Error persisting state:', error);
    if (error.name === 'QuotaExceededError') {
      localStorage.removeItem(QA_CHAT_STORAGE_KEY);
      localStorage.removeItem(QA_CHAT_VERSION_KEY);
    }
  }
};

const persistedState = loadPersistedNotebookChatState();

export const useNotebookChatStore = create((set, get) => ({
  chats: persistedState?.chats || {},

  getMessages: (collectionId) => {
    const state = get();
    return state.chats[collectionId]?.messages || [];
  },

  setMessages: (collectionId, messages) => {
    set(state => ({
      chats: {
        ...state.chats,
        [collectionId]: {
          messages,
          timestamp: Date.now()
        }
      }
    }));
  },

  addMessage: (collectionId, message) => {
    const newMessage = {
      ...message,
      timestamp: message.timestamp || Date.now(),
      id: message.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    set(state => {
      const currentMessages = state.chats[collectionId]?.messages || [];
      return {
        chats: {
          ...state.chats,
          [collectionId]: {
            messages: [...currentMessages, newMessage],
            timestamp: Date.now()
          }
        }
      };
    });
  },

  clearMessages: (collectionId) => {
    set(state => {
      const newChats = { ...state.chats };
      delete newChats[collectionId];
      return { chats: newChats };
    });
  },

  clearAllChats: () => {
    set({ chats: {} });
    localStorage.removeItem(QA_CHAT_STORAGE_KEY);
  }
}));

useNotebookChatStore.subscribe(
  (state) => {
    const hasMessages = Object.values(state.chats).some(
      chat => chat?.messages?.length > 0
    );
    if (hasMessages) {
      persistNotebookChatState(state.chats);
    }
  },
  (state) => state.chats
);

export default useNotebookChatStore;
