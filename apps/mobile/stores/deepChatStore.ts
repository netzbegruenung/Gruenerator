/**
 * Deep Chat Store
 *
 * Zustand store for the streaming chat tab.
 * Manages threads, messages, SSE streaming state, and GiftedChat bridging.
 */

import { create } from 'zustand';

import { ASSISTANT_USER, CURRENT_USER } from '../components/chat';
import {
  streamChatMessage,
  type ThinkingStep,
  type Citation,
  type GeneratedImage,
  type DoneEvent,
} from '../services/chatStream';
import {
  listThreads,
  loadMessages,
  deleteThread as apiDeleteThread,
  type Thread,
  type Message,
} from '../services/chatThreads';

import type { IMessage } from 'react-native-gifted-chat';

export interface DeepChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
  citations?: Citation[];
  generatedImage?: GeneratedImage | null;
  toolInvocations?: Array<{
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
    state: string;
    result?: unknown;
  }>;
}

interface DeepChatState {
  threads: Thread[];
  activeThreadId: string | null;
  messages: DeepChatMessage[];
  isStreaming: boolean;
  isLoadingThreads: boolean;
  isLoadingMessages: boolean;
  streamingText: string;
  thinkingSteps: ThinkingStep[];
  error: string | null;
  abortController: AbortController | null;
}

interface DeepChatActions {
  loadThreads: () => Promise<void>;
  switchThread: (threadId: string) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  cancelStream: () => void;
  startNewChat: () => void;
  deleteThread: (threadId: string) => Promise<void>;
  clearError: () => void;
}

type DeepChatStore = DeepChatState & DeepChatActions;

function apiMessageToDeepChat(msg: Message): DeepChatMessage {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content || '',
    createdAt: new Date(msg.createdAt),
    citations: msg.metadata?.citations as Citation[] | undefined,
    toolInvocations: msg.toolInvocations,
  };
}

export function toGiftedMessages(
  messages: DeepChatMessage[],
  streamingText: string,
  isStreaming: boolean
): IMessage[] {
  const gifted: IMessage[] = messages.map((msg) => ({
    _id: msg.id,
    text: msg.content,
    createdAt: msg.createdAt,
    user: msg.role === 'user' ? CURRENT_USER : ASSISTANT_USER,
  }));

  // Add streaming message if actively receiving text
  if (isStreaming && streamingText) {
    gifted.push({
      _id: 'streaming',
      text: streamingText,
      createdAt: new Date(),
      user: ASSISTANT_USER,
    });
  }

  // GiftedChat expects reverse chronological
  return gifted.reverse();
}

function buildUIMessages(messages: DeepChatMessage[]): Array<{
  id: string;
  role: string;
  content: string;
  createdAt: Date;
  parts: Array<{ type: string; text?: string }>;
}> {
  return messages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    createdAt: msg.createdAt,
    parts: [{ type: 'text', text: msg.content }],
  }));
}

export const useDeepChatStore = create<DeepChatStore>()((set, get) => ({
  threads: [],
  activeThreadId: null,
  messages: [],
  isStreaming: false,
  isLoadingThreads: false,
  isLoadingMessages: false,
  streamingText: '',
  thinkingSteps: [],
  error: null,
  abortController: null,

  loadThreads: async () => {
    set({ isLoadingThreads: true, error: null });
    try {
      const threads = await listThreads();
      set({ threads, isLoadingThreads: false });
    } catch (error: unknown) {
      set({
        isLoadingThreads: false,
        error: error instanceof Error ? error.message : 'Fehler beim Laden der Unterhaltungen',
      });
    }
  },

  switchThread: async (threadId: string) => {
    const { activeThreadId, isStreaming } = get();
    if (activeThreadId === threadId) return;
    if (isStreaming) get().cancelStream();

    set({
      activeThreadId: threadId,
      messages: [],
      isLoadingMessages: true,
      streamingText: '',
      thinkingSteps: [],
      error: null,
    });

    try {
      const apiMessages = await loadMessages(threadId);
      const messages = apiMessages.map(apiMessageToDeepChat);
      set({ messages, isLoadingMessages: false });
    } catch (error: unknown) {
      set({
        isLoadingMessages: false,
        error: error instanceof Error ? error.message : 'Fehler beim Laden der Nachrichten',
      });
    }
  },

  sendMessage: async (text: string) => {
    console.log('[DeepChat] sendMessage:', text);
    const { messages, activeThreadId, isStreaming } = get();
    if (isStreaming) return;

    const userMessage: DeepChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date(),
    };

    const updatedMessages = [...messages, userMessage];
    const abortController = new AbortController();

    set({
      messages: updatedMessages,
      isStreaming: true,
      streamingText: '',
      thinkingSteps: [],
      error: null,
      abortController,
    });

    let finalThreadId = activeThreadId;
    let fullText = '';
    let finalCitations: Citation[] = [];
    let finalImage: GeneratedImage | null = null;

    await streamChatMessage(
      {
        messages: buildUIMessages(updatedMessages),
        threadId: activeThreadId || undefined,
      },
      {
        onThreadCreated: (threadId) => {
          finalThreadId = threadId;
          set({ activeThreadId: threadId });
        },
        onThinkingStep: (step) => {
          set((state) => {
            const steps = [...state.thinkingSteps];
            const existingIdx = steps.findIndex((s) => s.stepId === step.stepId);
            if (existingIdx >= 0) {
              steps[existingIdx] = step;
            } else {
              steps.push(step);
            }
            return { thinkingSteps: steps };
          });
        },
        onTextDelta: (text) => {
          fullText += text;
          set({ streamingText: fullText });
        },
        onDone: (data: DoneEvent) => {
          finalCitations = data.citations || [];
          finalImage = data.generatedImage || null;
          if (data.threadId && !finalThreadId) {
            finalThreadId = data.threadId;
          }
        },
        onError: (error) => {
          set({ error, isStreaming: false, abortController: null });
        },
      },
      abortController.signal
    );

    // Finalize: add assistant message to the list
    if (fullText || finalImage) {
      const assistantMessage: DeepChatMessage = {
        id: `assistant_${Date.now()}`,
        role: 'assistant',
        content: fullText,
        createdAt: new Date(),
        citations: finalCitations.length > 0 ? finalCitations : undefined,
        generatedImage: finalImage,
      };

      set((state) => ({
        messages: [...state.messages, assistantMessage],
        isStreaming: false,
        streamingText: '',
        abortController: null,
        activeThreadId: finalThreadId || state.activeThreadId,
      }));
    } else {
      set({ isStreaming: false, streamingText: '', abortController: null });
    }

    // Refresh thread list in background
    get().loadThreads();
  },

  cancelStream: () => {
    const { abortController } = get();
    abortController?.abort();
    set({ isStreaming: false, streamingText: '', abortController: null });
  },

  startNewChat: () => {
    const { isStreaming } = get();
    if (isStreaming) get().cancelStream();

    set({
      activeThreadId: null,
      messages: [],
      streamingText: '',
      thinkingSteps: [],
      error: null,
    });
  },

  deleteThread: async (threadId: string) => {
    try {
      await apiDeleteThread(threadId);
      set((state) => ({
        threads: state.threads.filter((t) => t.id !== threadId),
        ...(state.activeThreadId === threadId
          ? { activeThreadId: null, messages: [], streamingText: '' }
          : {}),
      }));
    } catch (error: unknown) {
      set({
        error: error instanceof Error ? error.message : 'Fehler beim Löschen',
      });
    }
  },

  clearError: () => set({ error: null }),
}));
