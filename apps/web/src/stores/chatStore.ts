import { create } from 'zustand';
import useGeneratedTextStore from './core/generatedTextStore';

interface SharepicMetadata {
  sharepicType?: string;
  [key: string]: unknown;
}

interface SharepicObject {
  [key: string]: unknown;
}

interface SharepicContent {
  type: 'sharepic';
  sharepic: SharepicObject;
  sharepicTitle?: string;
  sharepicDownloadText?: string;
  sharepicDownloadFilename?: string;
  showEditButton?: boolean;
  sharepicMeta?: SharepicMetadata;
  metadata?: Record<string, unknown>;
}

interface TextContent {
  type: 'text';
  text?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

interface SocialContent {
  type: 'social';
  social?: { content?: string };
  metadata?: Record<string, unknown>;
}

interface LinesContent {
  type: 'lines';
  lines?: string[];
  metadata?: Record<string, unknown>;
}

type ChatContent = SharepicContent | TextContent | SocialContent | LinesContent;

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  agent?: string;
  metadata?: Record<string, unknown>;
  suggestions?: string[];
}

interface MultiResult {
  id: string;
  componentId: string;
  agent?: string;
  confidence?: number;
  metadata: Record<string, unknown>;
  suggestions: string[];
  error?: string;
  title?: string;
  runId: string;
}

interface AgentResponse {
  agent?: string;
  content?: ChatContent;
  suggestions?: string[];
  id?: string;
  componentId?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
  title?: string;
  error?: string;
}

interface ChatState {
  messages: ChatMessage[];
  context: Record<string, unknown>;
  currentAgent: string | null;
  metadata: Record<string, unknown>;
  multiResults: MultiResult[];
  lastMultiRunId: string | null;
  activeResultId: string | null;
  timestamp?: number;
}

interface PersistedChatData {
  chatState: ChatState;
  timestamp: number;
  cacheVersion: string;
}

interface ChatStore {
  messages: ChatMessage[];
  context: Record<string, unknown>;
  currentAgent: string | null;
  metadata: Record<string, unknown>;
  multiResults: MultiResult[];
  lastMultiRunId: string | null;
  activeResultId: string | null;
  isLoading: boolean;
  error: string | null;

  addMessage: (message: Partial<ChatMessage>) => void;
  updateContext: (newContext: Record<string, unknown>) => void;
  setCurrentAgent: (agent: string | null) => void;
  updateMetadata: (newMetadata: Record<string, unknown>) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setActiveResultId: (componentId: string | null) => void;
  getResultById: (componentId: string) => MultiResult | undefined;
  setMultiResults: (results: AgentResponse[], options?: { runId?: string }) => void;
  clearMultiResults: () => void;
  updateMultiResultContent: (componentId: string, updater: ((content: unknown) => unknown) | unknown) => void;
  clearMessages: () => void;
  getLastGeneratedText: () => string | null;
  getApiContext: () => Record<string, unknown>;
  handleAgentResponse: (response: AgentResponse) => void;
  handleMultiAgentResponses: (responses: AgentResponse[]) => void;
  initializeChat: () => void;
}

const resolveContentText = (content: ChatContent | string | undefined | null): string => {
  if (!content) return '';
  if (typeof content === 'string') return content;

  if (content.type === 'text') {
    if (typeof content.text === 'string') return content.text;
    if (typeof content.content === 'string') return content.content;
  } else if (content.type === 'social') {
    if (content.social?.content && typeof content.social.content === 'string') {
      return content.social.content;
    }
  } else if (content.type === 'lines') {
    if (Array.isArray(content.lines)) {
      return content.lines.filter(Boolean).join('\n');
    }
  } else if (content.type === 'sharepic') {
    // Sharepic content doesn't have direct text representation
    return '';
  }

  return '';
};

const CHAT_STORAGE_KEY = 'gruenerator_chat_state';
const CHAT_CACHE_VERSION = '1.0';
const CHAT_VERSION_KEY = 'gruenerator_chat_cache_version';
const CHAT_EXPIRY_TIME = 24 * 60 * 60 * 1000;

const loadPersistedChatState = (): ChatState | null => {
  try {
    const storedVersion = localStorage.getItem(CHAT_VERSION_KEY);
    if (storedVersion !== CHAT_CACHE_VERSION) {
      localStorage.removeItem(CHAT_STORAGE_KEY);
      localStorage.setItem(CHAT_VERSION_KEY, CHAT_CACHE_VERSION);
      return null;
    }

    const stored = localStorage.getItem(CHAT_STORAGE_KEY);
    if (stored) {
      const { chatState, timestamp, cacheVersion } = JSON.parse(stored) as PersistedChatData;

      if (cacheVersion !== CHAT_CACHE_VERSION) {
        localStorage.removeItem(CHAT_STORAGE_KEY);
        return null;
      }

      if (timestamp && Date.now() - timestamp < CHAT_EXPIRY_TIME) {
        return {
          messages: chatState.messages || [],
          context: chatState.context || {},
          currentAgent: chatState.currentAgent || null,
          metadata: chatState.metadata || {},
          multiResults: chatState.multiResults || [],
          lastMultiRunId: chatState.lastMultiRunId || null,
          activeResultId: chatState.activeResultId || null,
        };
      } else {
        localStorage.removeItem(CHAT_STORAGE_KEY);
      }
    }
  } catch (error) {
    localStorage.removeItem(CHAT_STORAGE_KEY);
    localStorage.removeItem(CHAT_VERSION_KEY);
  }
  return null;
};

const persistChatState = (chatState: ChatStore) => {
  try {
    const dataToStore: PersistedChatData = {
      chatState: {
        messages: chatState.messages,
        context: chatState.context,
        currentAgent: chatState.currentAgent,
        metadata: chatState.metadata,
        multiResults: chatState.multiResults,
        lastMultiRunId: chatState.lastMultiRunId,
        activeResultId: chatState.activeResultId
      },
      timestamp: Date.now(),
      cacheVersion: CHAT_CACHE_VERSION,
    };

    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(dataToStore));
    localStorage.setItem(CHAT_VERSION_KEY, CHAT_CACHE_VERSION);
  } catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      localStorage.removeItem(CHAT_STORAGE_KEY);
      localStorage.removeItem(CHAT_VERSION_KEY);
    }
  }
};

const persistedState = loadPersistedChatState();

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: persistedState?.messages || [],
  context: persistedState?.context || {},
  currentAgent: persistedState?.currentAgent || null,
  metadata: persistedState?.metadata || {},
  multiResults: persistedState?.multiResults || [],
  lastMultiRunId: persistedState?.lastMultiRunId || null,
  activeResultId: persistedState?.activeResultId || null,
  isLoading: false,
  error: null,

  addMessage: (message) => {
    const newMessage: ChatMessage = {
      id: message.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: message.type || 'user',
      content: message.content || '',
      timestamp: message.timestamp || Date.now(),
      agent: message.agent,
      metadata: message.metadata,
      suggestions: message.suggestions
    };

    set(state => ({
      messages: [...state.messages, newMessage]
    }));
  },

  updateContext: (newContext) => {
    set(state => ({
      context: { ...state.context, ...newContext }
    }));
  },

  setCurrentAgent: (agent) => {
    set({ currentAgent: agent });
  },

  updateMetadata: (newMetadata) => {
    set(state => ({
      metadata: { ...state.metadata, ...newMetadata }
    }));
  },

  setLoading: (isLoading) => {
    set({ isLoading });
  },

  setError: (error) => {
    set({ error });
  },

  setActiveResultId: (componentId) => {
    set({ activeResultId: componentId || null });
  },

  getResultById: (componentId) => {
    if (!componentId) return undefined;
    const state = get();
    return state.multiResults.find(result => result.componentId === componentId);
  },

  setMultiResults: (results, options = {}) => {
    const runId = options.runId || `multi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const textStore = useGeneratedTextStore.getState();

    const normalizedResults: MultiResult[] = Array.isArray(results)
      ? results.map((result, index) => {
          const componentId = result.componentId || `${runId}_${index}`;
          const metadata = {
            agent: result.agent,
            ...(result.content?.metadata || {}),
            ...(result.content?.sharepicMeta ? { sharepicMeta: result.content.sharepicMeta } : {})
          };

          const storePayload = result.content?.sharepic
            ? {
                content: result.content?.text,
                sharepic: result.content.sharepic,
                sharepicTitle: result.content.sharepicTitle,
                sharepicDownloadText: result.content.sharepicDownloadText,
                sharepicDownloadFilename: result.content.sharepicDownloadFilename,
                showEditButton: result.content.showEditButton !== false,
                sharepicMeta: result.content.sharepicMeta
              }
            : result.content?.text ?? result.content;

          if (storePayload) {
            textStore.setGeneratedText(componentId, storePayload, metadata);
          }

          const textValue = resolveContentText(result.content);
          if (textValue) {
            textStore.setGeneratedText(`${componentId}_text`, textValue, metadata);
          }

          return {
            id: result.id || `${componentId}`,
            componentId,
            agent: result.agent,
            confidence: result.confidence,
            metadata: result.metadata || result.content?.metadata || {},
            suggestions: result.suggestions || [],
            title: result.title,
            runId
          };
        })
      : [];

    set({
      multiResults: normalizedResults,
      lastMultiRunId: runId,
      activeResultId: null
    });
  },

  clearMultiResults: () => {
    const state = get();
    const textStore = useGeneratedTextStore.getState();

    if (Array.isArray(state.multiResults)) {
      state.multiResults.forEach(result => {
        if (result?.componentId) {
          textStore.clearGeneratedText(result.componentId);
          textStore.clearGeneratedText(`${result.componentId}_text`);
        }
      });
    }

    set({ multiResults: [], lastMultiRunId: null, activeResultId: null });
  },

  updateMultiResultContent: (componentId, updater) => {
    if (!componentId) return;

    const state = get();
    const target = state.multiResults.find(result => result.componentId === componentId);
    if (!target) {
      return;
    }

    const textStore = useGeneratedTextStore.getState();
    const currentContent = textStore.generatedTexts?.[componentId];
    const nextContent = typeof updater === 'function' ? updater(currentContent) : updater;

    const metadata = {
      agent: target.agent,
      ...(nextContent?.metadata || {}),
      ...(nextContent?.sharepicMeta ? { sharepicMeta: nextContent.sharepicMeta } : {})
    };

    if (typeof textStore.pushToHistory === 'function') {
      textStore.pushToHistory(componentId);
    }
    textStore.setGeneratedText(componentId, nextContent, metadata);

    const textOnlyValue = resolveContentText(nextContent);
    if (textOnlyValue) {
      if (typeof textStore.pushToHistory === 'function') {
        textStore.pushToHistory(`${componentId}_text`);
      }
      textStore.setGeneratedText(`${componentId}_text`, textOnlyValue, metadata);
    }
  },

  clearMessages: () => {
    const textStore = useGeneratedTextStore.getState();

    const state = get();
    if (Array.isArray(state.multiResults)) {
      state.multiResults.forEach(result => {
        if (result?.componentId) {
          textStore.clearGeneratedText(result.componentId);
          textStore.clearGeneratedText(`${result.componentId}_text`);
        }
      });
    }

    set({
      messages: [],
      context: {},
      currentAgent: null,
      metadata: {},
      error: null,
      multiResults: [],
      lastMultiRunId: null,
      activeResultId: null
    });

    textStore.clearGeneratedText('grueneratorChat');

    if (typeof textStore.clearEditChat === 'function') {
      textStore.clearEditChat('grueneratorChat');
    }

    localStorage.removeItem(CHAT_STORAGE_KEY);
  },

  getLastGeneratedText: () => {
    const state = get();
    const lastAssistantMessage = state.messages
      .filter(msg => msg.type === 'assistant')
      .pop();
    return lastAssistantMessage?.content || null;
  },

  getApiContext: () => {
    const state = get();
    return {
      lastAgent: state.currentAgent,
      topic: state.context.topic,
      details: state.context.details,
      lastGeneratedText: state.getLastGeneratedText(),
      ...state.context
    };
  },

  handleAgentResponse: (response) => {
    const state = get();

    if (response.agent) {
      state.setCurrentAgent(response.agent);
    }

    if (response.content?.metadata) {
      state.updateMetadata(response.content.metadata);
    }

    if (response.content?.text) {
      state.updateContext({
        lastGeneratedText: response.content.text
      });
    }

    if (response.content) {
      const textStore = useGeneratedTextStore.getState();
      const metadata = {
        agent: response.agent,
        ...(response.content?.metadata || {}),
        ...(response.content?.sharepicMeta ? { sharepicMeta: response.content.sharepicMeta } : {})
      };

      const storePayload = response.content.sharepic
        ? {
            content: response.content.text,
            sharepic: response.content.sharepic,
            sharepicTitle: response.content.sharepicTitle,
            sharepicDownloadText: response.content.sharepicDownloadText,
            sharepicDownloadFilename: response.content.sharepicDownloadFilename,
            showEditButton: response.content.showEditButton !== false,
            sharepicMeta: response.content.sharepicMeta
          }
        : response.content.text;

      textStore.setGeneratedText('grueneratorChat', storePayload, metadata);
    }

    let messageContent = response.content?.text;

    if (!messageContent && response.content?.sharepic) {
      const sharepicType = response.content.metadata?.sharepicType || response.agent;
      switch (sharepicType) {
        case 'zitat':
        case 'zitat_pure':
          messageContent = 'Hier ist Ihr Zitat-Sharepic! 📝';
          break;
        case 'info':
          messageContent = 'Hier ist Ihr Info-Sharepic! ℹ️';
          break;
        case 'dreizeilen':
          messageContent = 'Hier ist Ihr Dreizeilen-Sharepic! 📢';
          break;
        case 'headline':
          messageContent = 'Hier ist Ihr Headline-Sharepic! 🎯';
          break;
        default:
          messageContent = 'Hier ist Ihr Sharepic! 🎨';
      }
    }

    state.addMessage({
      type: 'assistant',
      content: messageContent || 'Entschuldigung, ich konnte keine Antwort generieren.',
      agent: response.agent,
      metadata: response.content?.metadata,
      suggestions: response.suggestions
    });
  },

  handleMultiAgentResponses: (responses = []) => {
    if (!Array.isArray(responses) || responses.length === 0) {
      return;
    }

    const runId = `multi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const textStore = useGeneratedTextStore.getState();

    const state = get();
    if (Array.isArray(state.multiResults)) {
      state.multiResults.forEach(result => {
        if (result?.componentId) {
          textStore.clearGeneratedText(result.componentId);
          textStore.clearGeneratedText(`${result.componentId}_text`);
        }
      });
    }

    textStore.clearGeneratedText('grueneratorChat');

    const enrichedResponses: MultiResult[] = responses.map((response, index) => {
      const componentId = response.componentId || `${runId}_${index}`;
      const metadata = {
        agent: response.agent,
        ...(response.content?.metadata || {}),
        ...(response.content?.sharepicMeta ? { sharepicMeta: response.content.sharepicMeta } : {})
      };

      const storePayload = response.content?.sharepic
        ? {
            content: response.content?.text,
            sharepic: response.content.sharepic,
            sharepicTitle: response.content.sharepicTitle,
            sharepicDownloadText: response.content.sharepicDownloadText,
            sharepicDownloadFilename: response.content.sharepicDownloadFilename,
            showEditButton: response.content.showEditButton !== false,
            sharepicMeta: response.content.sharepicMeta
          }
        : response.content?.text ?? response.content;

      if (storePayload) {
        textStore.setGeneratedText(componentId, storePayload, metadata);
      }

      const textValue = resolveContentText(response.content);
      if (textValue) {
        textStore.setGeneratedText(`${componentId}_text`, textValue, metadata);
      }

      return {
        id: response.id || `${componentId}`,
        componentId,
        agent: response.agent,
        confidence: response.confidence,
        metadata: response.metadata || response.content?.metadata || {},
        suggestions: response.suggestions || [],
        error: response.error,
        title: response.title,
        runId
      };
    });

    set({ multiResults: enrichedResponses, lastMultiRunId: runId, activeResultId: null });
  },

  initializeChat: () => {
    // No welcome message needed - start page provides context
  }
}));

let lastPersistedRefs: {
  messages: ChatMessage[] | null;
  context: Record<string, unknown> | null;
  currentAgent: string | null;
  multiResults: MultiResult[] | null;
} = {
  messages: null,
  context: null,
  currentAgent: null,
  multiResults: null
};

useChatStore.subscribe((state) => {
  if (state.messages.length > 0) {
    const hasChanged =
      lastPersistedRefs.messages !== state.messages ||
      lastPersistedRefs.context !== state.context ||
      lastPersistedRefs.currentAgent !== state.currentAgent ||
      lastPersistedRefs.multiResults !== state.multiResults;

    if (hasChanged) {
      lastPersistedRefs = {
        messages: state.messages,
        context: state.context,
        currentAgent: state.currentAgent,
        multiResults: state.multiResults
      };
      persistChatState(state);
    }
  }
});

export default useChatStore;
