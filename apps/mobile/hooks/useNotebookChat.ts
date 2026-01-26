import { useState, useEffect, useCallback } from 'react';
import {
  useNotebookChatStore,
  type NotebookChatMessage,
  type NotebookSource,
} from '../stores/notebookChatStore';
import { queryNotebook, queryMultiNotebook } from '../services/notebook';
import { getNotebookConfig, type NotebookConfig } from '../config/notebooksConfig';
import { useAuthStore } from '@gruenerator/shared/stores';
import { getErrorMessage } from '../utils/errors';

interface UseNotebookChatOptions {
  notebookId: string;
}

interface UseNotebookChatReturn {
  messages: NotebookChatMessage[];
  isLoading: boolean;
  sendMessage: (text: string) => Promise<void>;
  clearMessages: () => void;
  config: NotebookConfig;
}

export function useNotebookChat({ notebookId }: UseNotebookChatOptions): UseNotebookChatReturn {
  const [isLoading, setIsLoading] = useState(false);
  const config = getNotebookConfig(notebookId);
  const { getMessages, addMessage, updateLastMessage, clearMessages, loadFromStorage } =
    useNotebookChatStore();
  const locale = useAuthStore((state) => state.user?.locale) || 'de-DE';

  // Load persisted messages on mount
  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  const messages = getMessages(notebookId);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmedText = text.trim();
      if (!trimmedText || isLoading) return;

      // Add user message
      const userMessage: NotebookChatMessage = {
        id: `user-${Date.now()}`,
        type: 'user',
        content: trimmedText,
        timestamp: Date.now(),
      };
      addMessage(notebookId, userMessage);

      // Add placeholder assistant message
      const assistantMessageId = `assistant-${Date.now()}`;
      const placeholderMessage: NotebookChatMessage = {
        id: assistantMessageId,
        type: 'assistant',
        content: '',
        timestamp: Date.now(),
        isLoading: true,
      };
      addMessage(notebookId, placeholderMessage);

      setIsLoading(true);

      try {
        let answer: string;
        let sources: NotebookSource[] = [];
        let citations: NotebookSource[] = [];

        if (config.collectionType === 'multi') {
          // Multi-collection query
          const collectionIds = config.collections.map((c) => c.id);
          const response = await queryMultiNotebook({
            question: trimmedText,
            collectionIds,
            locale: locale as 'de-DE' | 'de-AT',
          });

          answer = response.answer;

          // Flatten sources from all collections
          for (const [collectionId, collectionSources] of Object.entries(
            response.sourcesByCollection || {}
          )) {
            if (!Array.isArray(collectionSources)) continue;
            const collection = config.collections.find((c) => c.id === collectionId);
            sources.push(
              ...collectionSources.map((s) => ({
                ...s,
                collectionName: collection?.name || collectionId,
              }))
            );
          }
          // For multi-collection, sources act as citations
          citations = sources;
        } else {
          // Single collection query
          const collectionId = config.collections[0]?.id;
          if (!collectionId) throw new Error('No collection configured');

          const response = await queryNotebook({
            question: trimmedText,
            collectionId,
            locale: locale as 'de-DE' | 'de-AT',
          });

          answer = response.answer;
          sources = response.sources || [];
          citations = response.citations || sources;
        }

        // Update the placeholder with actual response
        updateLastMessage(notebookId, {
          content: answer,
          sources,
          citations,
          isLoading: false,
        });
      } catch (error) {
        const errorContent = getErrorMessage(error);
        updateLastMessage(notebookId, {
          type: 'error',
          content: `Fehler: ${errorContent}`,
          isLoading: false,
        });
      } finally {
        setIsLoading(false);
      }
    },
    [notebookId, config, isLoading, addMessage, updateLastMessage, locale]
  );

  const handleClearMessages = useCallback(() => {
    clearMessages(notebookId);
  }, [notebookId, clearMessages]);

  return {
    messages,
    isLoading,
    sendMessage,
    clearMessages: handleClearMessages,
    config,
  };
}
