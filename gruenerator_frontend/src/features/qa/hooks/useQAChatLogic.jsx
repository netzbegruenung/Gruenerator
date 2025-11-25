import React, { useState, useCallback, useEffect } from 'react';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import useResponsive from '../../../components/common/Form/hooks/useResponsive';
import { CitationSourcesDisplay } from '../../../components/common/Citation';

const useQAChatLogic = ({
  collectionId,
  collectionName,
  welcomeMessage,
  extraApiParams = {},
  linkConfig = { type: 'vectorDocument', linkKey: 'document_id', titleKey: 'document_title' }
}) => {
  const { user } = useOptimizedAuth();
  const { isMobileView } = useResponsive(768);
  const [chatMessages, setChatMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [viewMode, setViewMode] = useState(isMobileView ? 'chat' : 'dossier');
  const [qaResults, setQaResults] = useState([]);

  const { setGeneratedText, setGeneratedTextMetadata } = useGeneratedTextStore();
  const { submitForm, loading: submitLoading } = useApiSubmit(`/auth/qa/${collectionId}/ask`);

  useEffect(() => {
    if (welcomeMessage) {
      setChatMessages([{
        type: 'assistant',
        content: welcomeMessage,
        timestamp: Date.now()
      }]);
    }
  }, [welcomeMessage]);

  useEffect(() => {
    if (isMobileView && viewMode !== 'chat') {
      setViewMode('chat');
    }
  }, [isMobileView, viewMode]);

  const handleSubmitQuestion = useCallback(async (question) => {
    const userMessage = {
      type: 'user',
      content: question,
      timestamp: Date.now(),
      userName: user?.user_metadata?.firstName || user?.email || 'Sie'
    };
    setChatMessages(prev => [...prev, userMessage]);
    setInputValue("");

    try {
      const result = await submitForm({ question, mode: viewMode, ...extraApiParams });

      if (result?.answer) {
        setChatMessages(prev => [...prev, {
          type: 'assistant',
          content: 'Hier ist meine Antwort:',
          timestamp: Date.now()
        }]);

        const resultId = `qa-${collectionId}-${Date.now()}`;
        const sources = result.sources || [];
        const citations = result.citations || [];

        setGeneratedText(resultId, result.answer);
        setGeneratedTextMetadata(resultId, { sources, citations });

        setQaResults(prev => [...prev, {
          id: resultId,
          componentId: resultId,
          title: question,
          content: { text: result.answer },
          displayActions: sources.length > 0 ? (
            <CitationSourcesDisplay
              sources={sources}
              citations={citations}
              linkConfig={linkConfig}
              title="Quellen"
              className="qa-citation-sources"
            />
          ) : null
        }]);
      }
    } catch (error) {
      console.error('[useQAChatLogic] Error:', error);
      setChatMessages(prev => [...prev, {
        type: 'error',
        content: 'Entschuldigung, es gab einen Fehler. Bitte versuche es erneut.',
        timestamp: Date.now()
      }]);
    }
  }, [submitForm, user, viewMode, extraApiParams, collectionId, setGeneratedText, setGeneratedTextMetadata, linkConfig]);

  const clearResults = useCallback(() => setQaResults([]), []);

  return {
    chatMessages,
    inputValue,
    viewMode,
    qaResults,
    submitLoading,
    user,
    setInputValue,
    setViewMode,
    setChatMessages,
    handleSubmitQuestion,
    clearResults
  };
};

export default useQAChatLogic;
