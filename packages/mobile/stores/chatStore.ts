import { create } from 'zustand';
import {
  sendChatMessage as apiSendChatMessage,
  clearChatHistory as apiClearChatHistory,
  normalizeResponse,
  createUserMessage,
  buildContextFromMessages,
  type GrueneratorChatMessage,
  type ChatAttachment,
  type ChatContext,
} from '../services/chat';
import { getErrorMessage } from '../utils/errors';

interface ChatState {
  messages: GrueneratorChatMessage[];
  isLoading: boolean;
  error: string | null;
  pendingAttachments: ChatAttachment[];
}

interface ChatActions {
  sendMessage: (text: string, attachments?: ChatAttachment[]) => Promise<void>;
  addMessage: (message: GrueneratorChatMessage) => void;
  clearMessages: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  addAttachment: (attachment: ChatAttachment) => void;
  removeAttachment: (index: number) => void;
  clearAttachments: () => void;
  getContext: () => ChatContext;
}

type ChatStore = ChatState & ChatActions;

const initialWelcomeMessage: GrueneratorChatMessage = {
  id: 'welcome',
  type: 'assistant',
  content: 'Hallo! Ich bin der Grünerator. Wie kann ich dir helfen? Du kannst mich bitten, Texte zu erstellen, Sharepics zu grünerieren, oder einfach Fragen stellen.',
  timestamp: Date.now(),
  agent: 'conversation',
};

export const useChatStore = create<ChatStore>()((set, get) => ({
  messages: [initialWelcomeMessage],
  isLoading: false,
  error: null,
  pendingAttachments: [],

  sendMessage: async (text: string, attachments?: ChatAttachment[]) => {
    const { messages, pendingAttachments } = get();
    const allAttachments = [...(attachments || []), ...pendingAttachments];

    const userMessage = createUserMessage(text, allAttachments.length > 0 ? allAttachments : undefined);

    set({
      messages: [...messages, userMessage],
      isLoading: true,
      error: null,
      pendingAttachments: [],
    });

    try {
      const context = buildContextFromMessages([...messages, userMessage]);

      const response = await apiSendChatMessage({
        message: text,
        context,
        attachments: allAttachments.length > 0 ? allAttachments : undefined,
      });

      const assistantMessage = normalizeResponse(response);

      set((state) => ({
        messages: [...state.messages, assistantMessage],
        isLoading: false,
      }));
    } catch (error: unknown) {
      const errorContent = getErrorMessage(error);
      const errorMessage: GrueneratorChatMessage = {
        id: Date.now().toString(),
        type: 'error',
        content: errorContent,
        timestamp: Date.now(),
      };

      set((state) => ({
        messages: [...state.messages, errorMessage],
        isLoading: false,
        error: errorContent,
      }));
    }
  },

  addMessage: (message: GrueneratorChatMessage) => {
    set((state) => ({
      messages: [...state.messages, message],
    }));
  },

  clearMessages: async () => {
    try {
      await apiClearChatHistory();
    } catch (error: unknown) {
      console.warn('[ChatStore] Failed to clear server history:', error);
    }

    set({
      messages: [initialWelcomeMessage],
      error: null,
      pendingAttachments: [],
    });
  },

  setLoading: (loading: boolean) => {
    set({ isLoading: loading });
  },

  setError: (error: string | null) => {
    set({ error });
  },

  addAttachment: (attachment: ChatAttachment) => {
    set((state) => ({
      pendingAttachments: [...state.pendingAttachments, attachment],
    }));
  },

  removeAttachment: (index: number) => {
    set((state) => ({
      pendingAttachments: state.pendingAttachments.filter((_, i) => i !== index),
    }));
  },

  clearAttachments: () => {
    set({ pendingAttachments: [] });
  },

  getContext: () => {
    return buildContextFromMessages(get().messages);
  },
}));
