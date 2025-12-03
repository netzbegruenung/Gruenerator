import { create } from 'zustand';
import useGeneratedTextStore from './core/generatedTextStore';

const resolveContentText = (content) => {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (typeof content.text === 'string') return content.text;
  if (typeof content.content === 'string') return content.content;
  if (content.social?.content && typeof content.social.content === 'string') {
    return content.social.content;
  }
  if (Array.isArray(content.lines)) {
    return content.lines.filter(Boolean).join('\n');
  }
  return '';
};

// localStorage keys for chat state persistence
const CHAT_STORAGE_KEY = 'gruenerator_chat_state';
const CHAT_CACHE_VERSION = '1.0';
const CHAT_VERSION_KEY = 'gruenerator_chat_cache_version';
const CHAT_EXPIRY_TIME = 24 * 60 * 60 * 1000; // 24 hours

// Helper to load persisted chat state
const loadPersistedChatState = () => {
  try {
    // Check cache version first
    const storedVersion = localStorage.getItem(CHAT_VERSION_KEY);
    if (storedVersion !== CHAT_CACHE_VERSION) {
      localStorage.removeItem(CHAT_STORAGE_KEY);
      localStorage.setItem(CHAT_VERSION_KEY, CHAT_CACHE_VERSION);
      return null;
    }

    const stored = localStorage.getItem(CHAT_STORAGE_KEY);
    if (stored) {
      const { chatState, timestamp, cacheVersion } = JSON.parse(stored);

      // Double-check cache version in stored data
      if (cacheVersion !== CHAT_CACHE_VERSION) {
        localStorage.removeItem(CHAT_STORAGE_KEY);
        return null;
      }

      // Check if stored state is still valid (not expired)
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
        // Remove expired data
        localStorage.removeItem(CHAT_STORAGE_KEY);
      }
    }
  } catch (error) {
    console.warn('[ChatStore] Error loading persisted state:', error);
    localStorage.removeItem(CHAT_STORAGE_KEY);
    localStorage.removeItem(CHAT_VERSION_KEY);
  }
  return null;
};

// Helper to persist chat state
const persistChatState = (chatState) => {
  try {
    const dataToStore = {
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
    console.warn('[ChatStore] Error persisting state:', error);
    // If storage is full, try to clear some space
    if (error.name === 'QuotaExceededError') {
      localStorage.removeItem(CHAT_STORAGE_KEY);
      localStorage.removeItem(CHAT_VERSION_KEY);
    }
  }
};

// Load initial state from localStorage if available
const persistedState = loadPersistedChatState();

/**
 * Zustand store for Grünerator Chat state management
 * Manages conversation history, context, and agent interactions
 */
export const useChatStore = create((set, get) => ({
  // Chat state - use persisted state if available, otherwise defaults
  messages: persistedState?.messages || [],
  context: persistedState?.context || {},
  currentAgent: persistedState?.currentAgent || null,
  metadata: persistedState?.metadata || {},
  multiResults: persistedState?.multiResults || [],
  lastMultiRunId: persistedState?.lastMultiRunId || null,
  activeResultId: persistedState?.activeResultId || null,
  activeResultId: persistedState?.activeResultId || null,

  // UI state
  isLoading: false,
  error: null,

  // Actions

  /**
   * Add a new message to the conversation
   * @param {Object} message - Message object with type, content, timestamp
   */
  addMessage: (message) => {
    const newMessage = {
      ...message,
      timestamp: message.timestamp || Date.now(),
      id: message.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    set(state => ({
      messages: [...state.messages, newMessage]
    }));
  },

  /**
   * Update the conversation context
   * @param {Object} newContext - Context updates
   */
  updateContext: (newContext) => {
    set(state => ({
      context: { ...state.context, ...newContext }
    }));
  },

  /**
   * Set the current active agent
   * @param {string} agent - Agent name
   */
  setCurrentAgent: (agent) => {
    set({ currentAgent: agent });
  },

  /**
   * Update metadata for the current conversation
   * @param {Object} newMetadata - Metadata updates
   */
  updateMetadata: (newMetadata) => {
    set(state => ({
      metadata: { ...state.metadata, ...newMetadata }
    }));
  },

  /**
   * Set loading state
   * @param {boolean} isLoading - Loading state
   */
  setLoading: (isLoading) => {
    set({ isLoading });
  },

  /**
   * Set error state
   * @param {string|null} error - Error message or null to clear
   */
  setError: (error) => {
    set({ error });
  },

  /**
   * Set the active result card for editing
   * @param {string|null} componentId - Result identifier
   */
  setActiveResultId: (componentId) => {
    set({ activeResultId: componentId || null });
  },

  /**
   * Retrieve a result by its component identifier
   * @param {string} componentId
   * @returns {Object|undefined}
   */
  getResultById: (componentId) => {
    if (!componentId) return undefined;
    const state = get();
    return state.multiResults.find(result => result.componentId === componentId);
  },

  /**
   * Replace multi-result deck content
   * @param {Array} results - Array of processed intent responses
   * @param {Object} options - Additional options (runId)
   */
  setMultiResults: (results, options = {}) => {
    const runId = options.runId || `multi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const textStore = useGeneratedTextStore.getState();

    const normalizedResults = Array.isArray(results)
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
            content: result.content,
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

  /**
   * Clear multi-result deck and associated generated content
   */
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

  /**
   * Update content of a multi-result card and keep generated text store in sync
   * @param {string} componentId
   * @param {function|any} updater - Function receiving current content or direct replacement
   */
  updateMultiResultContent: (componentId, updater) => {
    if (!componentId) return;

    const state = get();
    const index = state.multiResults.findIndex(result => result.componentId === componentId);
    if (index === -1) {
      return;
    }

    const target = state.multiResults[index];
    const nextContent = typeof updater === 'function' ? updater(target.content) : updater;

    const updatedResult = {
      ...target,
      content: nextContent
    };

    const updatedResults = [...state.multiResults];
    updatedResults[index] = updatedResult;

    const textStore = useGeneratedTextStore.getState();
    const metadata = {
      agent: updatedResult.agent,
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

    set({ multiResults: updatedResults });
  },

  /**
   * Clear all messages and reset conversation
   */
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

    // Clear persisted state
    localStorage.removeItem(CHAT_STORAGE_KEY);
  },

  /**
   * Get the last generated text for context-aware operations
   */
  getLastGeneratedText: () => {
    const state = get();
    const lastAssistantMessage = state.messages
      .filter(msg => msg.type === 'assistant')
      .pop();
    return lastAssistantMessage?.content || null;
  },

  /**
   * Get conversation context for API calls
   */
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

  /**
   * Handle agent response and update state accordingly
   * @param {Object} response - API response from chat endpoint
   */
  handleAgentResponse: (response) => {
    const state = get();

    // Note: No longer clearing multi-results to allow accumulation of responses

    // Update current agent
    if (response.agent) {
      state.setCurrentAgent(response.agent);
    }

    // Update metadata
    if (response.content?.metadata) {
      state.updateMetadata(response.content.metadata);
    }

    // Update context based on response
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

    // Add assistant message
    let messageContent = response.content?.text;

    // For sharepic responses without text, show a nice message
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

  /**
   * Handle multiple agent responses in a single request
   * @param {Array} responses - Parsed responses per intent
   */
  handleMultiAgentResponses: (responses = []) => {
    if (!Array.isArray(responses) || responses.length === 0) {
      return;
    }

    const runId = `multi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const textStore = useGeneratedTextStore.getState();

    // Clear previous deck content before storing new results
    const state = get();
    if (Array.isArray(state.multiResults)) {
      state.multiResults.forEach(result => {
        if (result?.componentId) {
          textStore.clearGeneratedText(result.componentId);
        }
      });
    }

    // Reset single-result payload to avoid stale content in legacy view
    textStore.clearGeneratedText('grueneratorChat');

    const enrichedResponses = responses.map((response, index) => {
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

      return {
        id: response.id || `${componentId}`,
        componentId,
        agent: response.agent,
        confidence: response.confidence,
        content: response.content,
        metadata: response.metadata || response.content?.metadata || {},
        suggestions: response.suggestions || [],
        error: response.error,
        title: response.title,
        runId
      };
    });

    set({ multiResults: enrichedResponses, lastMultiRunId: runId, activeResultId: null });
  },

  /**
   * Initialize chat with welcome message
   */
  initializeChat: () => {
    // No welcome message needed - start page provides context
  }
}));

// Subscribe to changes and persist them to localStorage
useChatStore.subscribe(
  (state) => {
    // Only persist if there are messages to avoid overwriting with empty state
    if (state.messages.length > 0) {
      persistChatState(state);
    }
  },
  (state) => ({
    messages: state.messages,
    context: state.context,
    currentAgent: state.currentAgent,
    metadata: state.metadata,
    multiResults: state.multiResults,
    lastMultiRunId: state.lastMultiRunId,
    activeResultId: state.activeResultId,
  })
);

export default useChatStore;
