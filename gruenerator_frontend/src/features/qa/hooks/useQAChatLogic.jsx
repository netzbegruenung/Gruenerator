import { useState, useCallback, useEffect, useMemo } from 'react';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import useResponsive from '../../../components/common/Form/hooks/useResponsive';
import { useQAChatStore } from '../stores/qaChatStore';
import { shallow } from 'zustand/shallow';

const useQAChatLogic = ({
  collectionId,
  welcomeMessage,
  extraApiParams = {},
  linkConfig = { type: 'vectorDocument', linkKey: 'document_id', titleKey: 'document_title' }
}) => {
  const { user } = useOptimizedAuth();
  const { isMobileView } = useResponsive(768);
  const [inputValue, setInputValue] = useState("");

  const { setGeneratedText, setGeneratedTextMetadata } = useGeneratedTextStore();
  const { submitForm, loading: submitLoading } = useApiSubmit(`/auth/qa/${collectionId}/ask`);

  const chats = useQAChatStore(state => state.chats, shallow);
  const addMessage = useQAChatStore(state => state.addMessage);
  const setMessages = useQAChatStore(state => state.setMessages);

  const chatMessages = useMemo(() => {
    return chats[collectionId]?.messages || [];
  }, [chats, collectionId]);

  useEffect(() => {
    if (welcomeMessage && chatMessages.length === 0) {
      setMessages(collectionId, [{
        type: 'assistant',
        content: welcomeMessage,
        timestamp: Date.now(),
        id: `welcome_${collectionId}`
      }]);
    }
  }, [welcomeMessage, collectionId, chatMessages.length, setMessages]);

  const handleSubmitQuestion = useCallback(async (question) => {
    const userMessage = {
      type: 'user',
      content: question,
      timestamp: Date.now(),
      userName: user?.user_metadata?.firstName || user?.email || 'Sie'
    };
    addMessage(collectionId, userMessage);
    setInputValue("");

    try {
      const result = await submitForm({ question, mode: 'dossier', ...extraApiParams });

      if (result?.answer) {
        const resultId = `qa-${collectionId}-${Date.now()}`;
        const sources = result.sources || [];
        const citations = result.citations || [];
        const additionalSources = result.allSources || [];

        setGeneratedText(resultId, result.answer);
        setGeneratedTextMetadata(resultId, { sources, citations, additionalSources });

        addMessage(collectionId, {
          type: 'assistant',
          content: result.answer,
          timestamp: Date.now(),
          resultData: {
            resultId,
            question,
            sources,
            citations,
            additionalSources,
            linkConfig
          }
        });
      }
    } catch (error) {
      console.error('[useQAChatLogic] Error:', error);
      addMessage(collectionId, {
        type: 'error',
        content: 'Entschuldigung, es gab einen Fehler. Bitte versuche es erneut.',
        timestamp: Date.now()
      });
    }
  }, [submitForm, user, extraApiParams, collectionId, setGeneratedText, setGeneratedTextMetadata, linkConfig, addMessage]);

  const clearMessages = useQAChatStore(state => state.clearMessages);

  const handleClearMessages = useCallback(() => {
    clearMessages(collectionId);
  }, [clearMessages, collectionId]);

  const setChatMessages = useCallback((messagesOrUpdater) => {
    if (typeof messagesOrUpdater === 'function') {
      const currentMessages = chats[collectionId]?.messages || [];
      const newMessages = messagesOrUpdater(currentMessages);
      setMessages(collectionId, newMessages);
    } else {
      setMessages(collectionId, messagesOrUpdater);
    }
  }, [chats, collectionId, setMessages]);

  return {
    chatMessages,
    inputValue,
    submitLoading,
    user,
    isMobileView,
    setInputValue,
    setChatMessages,
    handleSubmitQuestion,
    clearMessages: handleClearMessages
  };
};

export default useQAChatLogic;
