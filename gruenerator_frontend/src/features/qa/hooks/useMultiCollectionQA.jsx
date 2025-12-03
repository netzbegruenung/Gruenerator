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
      const result = await processText('/auth/qa/multi/ask', {
        question,
        mode: 'dossier',
        collectionIds: collections.map(c => c.id)
      });

      if (result?.answer) {
        const resultId = `qa-multi-unified-${Date.now()}`;
        const sourcesByCollection = result.sourcesByCollection || {};
        const citations = result.citations || [];

        setGeneratedText(resultId, result.answer);
        setGeneratedTextMetadata(resultId, {
          sourcesByCollection,
          citations,
          collections: collections.map(c => c.id)
        });

        setChatMessages(prev => [...prev, {
          type: 'assistant',
          content: result.answer,
          timestamp: Date.now(),
          resultData: {
            resultId,
            question,
            sourcesByCollection,
            citations
          }
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
  }, [collections, user, setGeneratedText, setGeneratedTextMetadata]);

  return {
    chatMessages,
    inputValue,
    submitLoading,
    activeCollections,
    user,
    isMobileView,
    setInputValue,
    setChatMessages,
    handleSubmitQuestion
  };
};

export default useMultiCollectionQA;
