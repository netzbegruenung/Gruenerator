import { useState, useCallback, useEffect } from 'react';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { processText } from '../../../components/utils/apiClient';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import useResponsive from '../../../components/common/Form/hooks/useResponsive';

const useMultiCollectionQA = ({
  collections,
  welcomeMessage
}) => {
  const { user } = useOptimizedAuth();
  const { isMobileView } = useResponsive(768);
  const [chatMessages, setChatMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [viewMode, setViewMode] = useState(isMobileView ? 'chat' : 'dossier');
  const [qaResults, setQaResults] = useState([]);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [activeCollections, setActiveCollections] = useState([]);

  const { setGeneratedText, setGeneratedTextMetadata } = useGeneratedTextStore();

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
    setSubmitLoading(true);
    setActiveCollections(collections.map(c => c.name));

    try {
      // Call the unified multi-collection endpoint
      const result = await processText('/auth/qa/multi/ask', {
        question,
        mode: viewMode,
        collectionIds: collections.map(c => c.id)
      });

      if (result?.answer) {
        setChatMessages(prev => [...prev, {
          type: 'assistant',
          content: 'Hier ist meine Antwort:',
          timestamp: Date.now()
        }]);

        const resultId = `qa-multi-unified-${Date.now()}`;
        const sourcesByCollection = result.sourcesByCollection || {};
        const citations = result.citations || [];

        setGeneratedText(resultId, result.answer);
        setGeneratedTextMetadata(resultId, {
          sourcesByCollection,
          citations,
          collections: collections.map(c => c.id)
        });

        setQaResults(prev => [...prev, {
          id: resultId,
          componentId: resultId,
          title: question,
          content: { text: result.answer },
          sourcesByCollection,
          citations
        }]);
      } else {
        setChatMessages(prev => [...prev, {
          type: 'error',
          content: 'Leider konnte ich keine passende Antwort finden. Bitte versuche es mit einer anderen Frage.',
          timestamp: Date.now()
        }]);
      }

    } catch (error) {
      console.error('[useMultiCollectionQA] Error:', error);
      setChatMessages(prev => [...prev, {
        type: 'error',
        content: 'Entschuldigung, es gab einen Fehler. Bitte versuche es erneut.',
        timestamp: Date.now()
      }]);
    } finally {
      setSubmitLoading(false);
      setActiveCollections([]);
    }
  }, [collections, user, viewMode, setGeneratedText, setGeneratedTextMetadata]);

  const clearResults = useCallback(() => setQaResults([]), []);

  return {
    chatMessages,
    inputValue,
    viewMode,
    qaResults,
    submitLoading,
    activeCollections,
    user,
    setInputValue,
    setViewMode,
    setChatMessages,
    handleSubmitQuestion,
    clearResults
  };
};

export default useMultiCollectionQA;
