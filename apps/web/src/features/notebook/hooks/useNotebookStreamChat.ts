import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { shallow } from 'zustand/shallow';

import useResponsive from '../../../components/common/Form/hooks/useResponsive';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useAuthStore } from '../../../stores/authStore';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { useNotebookChatStore, NotebookChatMessage } from '../stores/notebookChatStore';
import useNotebookStore from '../stores/notebookStore';
import { isDesktopApp } from '../../../utils/platform';
import { getDesktopToken } from '../../../utils/desktopAuth';

interface Collection {
  id: string;
  name: string;
  linkType?: string;
}

interface UseNotebookStreamChatOptions {
  collections: Collection[];
  persistMessages?: boolean;
  welcomeMessage?: string;
  extraApiParams?: Record<string, unknown>;
}

interface Citation {
  index: string;
  cited_text?: string;
  document_title?: string;
  document_id?: string;
  source_url?: string | null;
  similarity_score?: number;
  chunk_index?: number;
  filename?: string | null;
  page_number?: number | null;
  collection_id?: string;
  collection_name?: string;
}

interface Source {
  document_id: string;
  document_title: string;
  source_url: string | null;
  chunk_text: string;
  similarity_score: number;
  citations: Citation[];
}

interface StreamCompletionData {
  type: 'completion';
  answer: string;
  citations: Citation[];
  sources: Source[];
  allSources: unknown[];
  sourcesByCollection?: Record<string, unknown>;
  metadata?: {
    isMulti: boolean;
    collectionName?: string;
    effectiveCollectionIds?: string[];
    totalResults: number;
    citationsCount: number;
  };
}

interface LinkConfig {
  type: 'external' | 'vectorDocument';
  linkKey: string;
  titleKey: string;
  urlKey?: string;
}

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

/**
 * Streaming notebook chat hook - uses Vercel AI SDK streaming for real-time responses
 *
 * @param options - Hook options
 * @returns Chat state and handlers
 */
const useNotebookStreamChat = ({
  collections,
  persistMessages = true,
  welcomeMessage,
  extraApiParams = {},
}: UseNotebookStreamChatOptions) => {
  const { user } = useOptimizedAuth();
  const locale = useAuthStore((state) => state.locale);
  const { isMobileView } = useResponsive(768);
  const [inputValue, setInputValue] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [activeCollectionNames, setActiveCollectionNames] = useState<string[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { setGeneratedText, setGeneratedTextMetadata } = useGeneratedTextStore();
  const { getFiltersForCollection, fetchFilterValues } = useNotebookStore();

  const isMulti = collections.length > 1;
  const collectionKey = useMemo(() => {
    return isMulti
      ? `multi:${collections
          .map((c) => c.id)
          .sort()
          .join('+')}`
      : collections[0]?.id || 'unknown';
  }, [collections, isMulti]);

  const chats = useNotebookChatStore((state) => state.chats, shallow);
  const addMessage = useNotebookChatStore((state) => state.addMessage);
  const setMessages = useNotebookChatStore((state) => state.setMessages);
  const clearMessagesStore = useNotebookChatStore((state) => state.clearMessages);

  const [localMessages, setLocalMessages] = useState<NotebookChatMessage[]>([]);

  const chatMessages = useMemo(() => {
    if (persistMessages) {
      return chats[collectionKey]?.messages || [];
    }
    return localMessages;
  }, [persistMessages, chats, collectionKey, localMessages]);

  const addMessageToChat = useCallback(
    (message: Partial<NotebookChatMessage> & { content: string; type: 'user' | 'assistant' }) => {
      if (persistMessages) {
        addMessage(collectionKey, message);
      } else {
        setLocalMessages((prev) => [
          ...prev,
          {
            ...message,
            id: message.id || `msg_${Date.now()}`,
            timestamp: message.timestamp || Date.now(),
          } as NotebookChatMessage,
        ]);
      }
    },
    [persistMessages, addMessage, collectionKey]
  );

  const setMessagesToChat = useCallback(
    (messages: NotebookChatMessage[]) => {
      if (persistMessages) {
        setMessages(collectionKey, messages);
      } else {
        setLocalMessages(messages);
      }
    },
    [persistMessages, setMessages, collectionKey]
  );

  useEffect(() => {
    collections.forEach((c) => fetchFilterValues(c.id));
  }, [collections, fetchFilterValues]);

  useEffect(() => {
    if (welcomeMessage && chatMessages.length === 0) {
      setMessagesToChat([
        {
          type: 'assistant',
          content: welcomeMessage,
          timestamp: Date.now(),
          id: `welcome_${collectionKey}`,
        },
      ]);
    }
  }, [welcomeMessage, collectionKey, chatMessages.length, setMessagesToChat]);

  const buildFilters = useCallback(() => {
    if (isMulti) {
      const aggregated: Record<string, unknown> = {};
      collections.forEach((c) => {
        const filters = getFiltersForCollection(c.id);
        if (Object.keys(filters).length > 0) {
          aggregated[c.id] = filters;
        }
      });
      return Object.keys(aggregated).length > 0 ? aggregated : undefined;
    }

    const filters = getFiltersForCollection(collections[0]?.id);
    return Object.keys(filters).length > 0 ? filters : undefined;
  }, [isMulti, collections, getFiltersForCollection]);

  const handleSubmitQuestion = useCallback(
    async (question: string) => {
      const userMessage: NotebookChatMessage = {
        id: `user_${Date.now()}`,
        type: 'user',
        content: question,
        timestamp: Date.now(),
        userName: user?.user_metadata?.firstName || user?.email || 'Sie',
      };
      addMessageToChat(userMessage);
      setInputValue('');
      setSubmitLoading(true);
      setStreamingText('');
      setActiveCollectionNames(collections.map((c) => c.name));

      abortControllerRef.current = new AbortController();

      try {
        const filters = buildFilters();
        const messages = [{ role: 'user', content: question }];

        const payload = {
          messages,
          ...(isMulti
            ? { collectionIds: collections.map((c) => c.id) }
            : { collectionId: collections[0].id }),
          ...(filters && { filters }),
          locale,
          ...extraApiParams,
        };

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        if (isDesktopApp()) {
          const token = await getDesktopToken();
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
        }

        const response = await fetch(`${baseURL}/chat-service/notebook/stream`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          credentials: isDesktopApp() ? 'omit' : 'include',
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP error ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let accumulatedText = '';
        let completionData: StreamCompletionData | null = null;
        let buffer = '';
        let currentEvent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE format: event: <name>\ndata: <json>\n\n
          const lines = buffer.split('\n');
          buffer = '';

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (currentEvent === 'text_delta' && data.text) {
                  accumulatedText += data.text;
                  setStreamingText(accumulatedText);
                } else if (currentEvent === 'completion') {
                  completionData = data as StreamCompletionData;
                } else if (currentEvent === 'error') {
                  throw new Error(data.error || 'Stream error');
                }

                currentEvent = '';
              } catch (parseError) {
                // If it's not JSON, might be an incomplete line - keep in buffer
                if (i === lines.length - 1 && !line.endsWith('}')) {
                  buffer = line;
                }
              }
            } else if (line === '' && i === lines.length - 1) {
              // Empty line at the end - might be incomplete, keep processing
            } else if (line !== '') {
              // Incomplete line at the end - keep in buffer
              if (i === lines.length - 1) {
                buffer = line;
              }
            }
          }
        }

        // Process the final result
        if (completionData) {
          const resultId = `qa-${collectionKey}-${Date.now()}`;

          let sources: Source[] | Citation[] = completionData.sources || [];
          const citations = completionData.citations || [];
          const additionalSources = completionData.allSources || [];
          const sourcesByCollection = completionData.sourcesByCollection;

          let linkConfig: LinkConfig;
          if (isMulti) {
            linkConfig = {
              type: 'external',
              linkKey: 'document_id',
              titleKey: 'document_title',
              urlKey: 'url',
            };
          } else {
            const collection = collections[0];
            linkConfig =
              collection.linkType === 'url'
                ? {
                    type: 'external',
                    linkKey: 'document_id',
                    titleKey: 'document_title',
                    urlKey: 'url',
                  }
                : { type: 'vectorDocument', linkKey: 'document_id', titleKey: 'document_title' };
          }

          setGeneratedText(resultId, completionData.answer);
          setGeneratedTextMetadata(resultId, {
            sources,
            citations,
            additionalSources,
            ...(isMulti && { sourcesByCollection, collections: collections.map((c) => c.id) }),
          });

          addMessageToChat({
            type: 'assistant',
            content: completionData.answer,
            timestamp: Date.now(),
            resultData: {
              resultId,
              question,
              sources,
              citations,
              additionalSources,
              linkConfig,
              ...(isMulti && { sourcesByCollection }),
            },
          });
        } else if (accumulatedText) {
          // No completion data but we have text (might be a simple response or error)
          addMessageToChat({
            type: 'assistant',
            content: accumulatedText,
            timestamp: Date.now(),
          });
        } else {
          addMessageToChat({
            type: 'assistant',
            content:
              'Leider konnte ich keine passende Antwort finden. Bitte versuche es mit einer anderen Frage.',
            timestamp: Date.now(),
          });
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          console.log('[useNotebookStreamChat] Request aborted');
          return;
        }

        console.error('[useNotebookStreamChat] Error:', error);
        addMessageToChat({
          type: 'assistant',
          content: 'Entschuldigung, es gab einen Fehler. Bitte versuche es erneut.',
          timestamp: Date.now(),
        });
      } finally {
        setSubmitLoading(false);
        setStreamingText('');
        setActiveCollectionNames([]);
        abortControllerRef.current = null;
      }
    },
    [
      user,
      collections,
      isMulti,
      collectionKey,
      extraApiParams,
      buildFilters,
      addMessageToChat,
      setGeneratedText,
      setGeneratedTextMetadata,
      locale,
    ]
  );

  const handleClearMessages = useCallback(() => {
    if (persistMessages) {
      clearMessagesStore(collectionKey);
    } else {
      setLocalMessages([]);
    }
  }, [persistMessages, clearMessagesStore, collectionKey]);

  const setChatMessages = useCallback(
    (messagesOrUpdater: NotebookChatMessage[] | ((prev: NotebookChatMessage[]) => NotebookChatMessage[])) => {
      if (typeof messagesOrUpdater === 'function') {
        const currentMessages = persistMessages
          ? chats[collectionKey]?.messages || []
          : localMessages;
        const newMessages = messagesOrUpdater(currentMessages);
        setMessagesToChat(newMessages);
      } else {
        setMessagesToChat(messagesOrUpdater);
      }
    },
    [persistMessages, chats, collectionKey, localMessages, setMessagesToChat]
  );

  const abortStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return {
    chatMessages,
    inputValue,
    submitLoading,
    streamingText,
    user,
    isMobileView,
    isMulti,
    collectionKey,
    activeCollections: activeCollectionNames,
    collections,
    setInputValue,
    setChatMessages,
    handleSubmitQuestion,
    clearMessages: handleClearMessages,
    abortStream,
  };
};

export default useNotebookStreamChat;
