import { useState, useCallback } from 'react';
import useApiSubmit from './useApiSubmit';

export const useGenerateSocialPost = () => {
  const [generatedPosts, setGeneratedPosts] = useState({});
  const { submitForm, loading, error } = useApiSubmit('/claude_social');

  const generatePost = useCallback(async (thema, details, platforms, includeActionIdeas) => {
    try {
      const content = await submitForm({ thema, details, platforms, includeActionIdeas });
      if (content) {
        setGeneratedPosts(content);
        return content;
      }
    } catch (err) {
      console.error('Fehler beim Generieren der Posts:', err);
      throw err; // Fehler weiterleiten, damit er in der Komponente behandelt werden kann
    }
  }, [submitForm]);

  return {
    generatedPosts,
    generatePost,
    loading,
    error
  };
};
