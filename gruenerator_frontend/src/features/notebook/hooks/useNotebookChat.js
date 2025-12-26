import { useState, useCallback, useEffect, useMemo } from 'react';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { processText } from '../../../components/utils/apiClient';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import useResponsive from '../../../components/common/Form/hooks/useResponsive';
import { useNotebookChatStore } from '../stores/notebookChatStore';
import useNotebookStore from '../stores/notebookStore';
import { shallow } from 'zustand/shallow';

/**
 * Unified notebook chat hook - handles both single and multi-collection queries
 *
 * @param {Object} options
 * @param {Array<{id: string, name: string, linkType?: string}>} options.collections - Array of collections
 * @param {boolean} [options.persistMessages=true] - Whether to persist messages in store
 * @param {string} [options.welcomeMessage] - Initial welcome message
 * @param {Object} [options.extraApiParams={}] - Additional API parameters
 */
const useNotebookChat = ({
  collections,
  persistMessages = true,
  welcomeMessage,
  extraApiParams = {}
}) => {
  const { user } = useOptimizedAuth();
  const { isMobileView } = useResponsive(768);
  const [inputValue, setInputValue] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [activeCollectionNames, setActiveCollectionNames] = useState([]);

  const { setGeneratedText, setGeneratedTextMetadata } = useGeneratedTextStore();
  const { getFiltersForCollection, fetchFilterValues } = useNotebookStore();

  const isMulti = collections.length > 1;
  const collectionKey = useMemo(() => {
    return isMulti
      ? `multi:${collections.map(c => c.id).sort().join('+')}`
      : collections[0]?.id || 'unknown';
  }, [collections, isMulti]);

  const chats = useNotebookChatStore(state => state.chats, shallow);
  const addMessage = useNotebookChatStore(state => state.addMessage);
  const setMessages = useNotebookChatStore(state => state.setMessages);
  const clearMessagesStore = useNotebookChatStore(state => state.clearMessages);

  const [localMessages, setLocalMessages] = useState([]);

  const chatMessages = useMemo(() => {
    if (persistMessages) {
      return chats[collectionKey]?.messages || [];
    }
    return localMessages;
  }, [persistMessages, chats, collectionKey, localMessages]);

  const addMessageToChat = useCallback((message) => {
    if (persistMessages) {
      addMessage(collectionKey, message);
    } else {
      setLocalMessages(prev => [...prev, message]);
    }
  }, [persistMessages, addMessage, collectionKey]);

  const setMessagesToChat = useCallback((messages) => {
    if (persistMessages) {
      setMessages(collectionKey, messages);
    } else {
      setLocalMessages(messages);
    }
  }, [persistMessages, setMessages, collectionKey]);

  useEffect(() => {
    collections.forEach(c => fetchFilterValues(c.id));
  }, [collections, fetchFilterValues]);

  useEffect(() => {
    if (welcomeMessage && chatMessages.length === 0) {
      setMessagesToChat([{
        type: 'assistant',
        content: welcomeMessage,
        timestamp: Date.now(),
        id: `welcome_${collectionKey}`
      }]);
    }
  }, [welcomeMessage, collectionKey, chatMessages.length, setMessagesToChat]);

  const buildFilters = useCallback(() => {
    if (isMulti) {
      const aggregated = {};
      collections.forEach(c => {
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

  const handleSubmitQuestion = useCallback(async (question) => {
    const userMessage = {
      type: 'user',
      content: question,
      timestamp: Date.now(),
      userName: user?.user_metadata?.firstName || user?.email || 'Sie'
    };
    addMessageToChat(userMessage);
    setInputValue('');
    setSubmitLoading(true);
    setActiveCollectionNames(collections.map(c => c.name));

    try {
      const filters = buildFilters();
      const endpoint = isMulti
        ? '/auth/notebook/multi/ask'
        : `/auth/notebook/${collections[0].id}/ask`;

      const payload = isMulti
        ? {
            question,
            mode: 'dossier',
            collectionIds: collections.map(c => c.id),
            ...(filters && { filters })
          }
        : {
            question,
            mode: 'dossier',
            ...(filters && { filters }),
            ...extraApiParams
          };

      const result = await processText(endpoint, payload);

      if (result?.answer) {
        const resultId = `qa-${collectionKey}-${Date.now()}`;

        let sources, citations, additionalSources, sourcesByCollection, linkConfig;

        if (isMulti) {
          sourcesByCollection = result.sourcesByCollection || {};
          citations = result.citations || [];
          sources = Object.values(sourcesByCollection).flatMap(c => c.sources || []);
          additionalSources = Object.values(sourcesByCollection).flatMap(c => c.allSources || []);
          linkConfig = {
            type: 'external',
            linkKey: 'document_id',
            titleKey: 'document_title',
            urlKey: 'url'
          };
        } else {
          sources = result.sources || [];
          citations = result.citations || [];
          additionalSources = result.allSources || [];
          const collection = collections[0];
          linkConfig = collection.linkType === 'url'
            ? { type: 'external', linkKey: 'document_id', titleKey: 'document_title', urlKey: 'url' }
            : { type: 'vectorDocument', linkKey: 'document_id', titleKey: 'document_title' };
        }

        setGeneratedText(resultId, result.answer);
        setGeneratedTextMetadata(resultId, {
          sources,
          citations,
          additionalSources,
          ...(isMulti && { sourcesByCollection, collections: collections.map(c => c.id) })
        });

        addMessageToChat({
          type: 'assistant',
          content: result.answer,
          timestamp: Date.now(),
          resultData: {
            resultId,
            question,
            sources,
            citations,
            additionalSources,
            linkConfig,
            ...(isMulti && { sourcesByCollection })
          }
        });
      } else {
        addMessageToChat({
          type: 'error',
          content: 'Leider konnte ich keine passende Antwort finden. Bitte versuche es mit einer anderen Frage.',
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('[useNotebookChat] Error:', error);
      addMessageToChat({
        type: 'error',
        content: 'Entschuldigung, es gab einen Fehler. Bitte versuche es erneut.',
        timestamp: Date.now()
      });
    } finally {
      setSubmitLoading(false);
      setActiveCollectionNames([]);
    }
  }, [
    user, collections, isMulti, collectionKey, extraApiParams,
    buildFilters, addMessageToChat, setGeneratedText, setGeneratedTextMetadata
  ]);

  const handleClearMessages = useCallback(() => {
    if (persistMessages) {
      clearMessagesStore(collectionKey);
    } else {
      setLocalMessages([]);
    }
  }, [persistMessages, clearMessagesStore, collectionKey]);

  const setChatMessages = useCallback((messagesOrUpdater) => {
    if (typeof messagesOrUpdater === 'function') {
      const currentMessages = persistMessages
        ? (chats[collectionKey]?.messages || [])
        : localMessages;
      const newMessages = messagesOrUpdater(currentMessages);
      setMessagesToChat(newMessages);
    } else {
      setMessagesToChat(messagesOrUpdater);
    }
  }, [persistMessages, chats, collectionKey, localMessages, setMessagesToChat]);

  return {
    chatMessages,
    inputValue,
    submitLoading,
    user,
    isMobileView,
    isMulti,
    collectionKey,
    activeCollections: activeCollectionNames,
    collections,
    setInputValue,
    setChatMessages,
    handleSubmitQuestion,
    clearMessages: handleClearMessages
  };
};

export default useNotebookChat;
