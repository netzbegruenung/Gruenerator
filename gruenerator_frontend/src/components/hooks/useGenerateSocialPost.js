import { useState, useCallback } from 'react';
import useApiSubmit from './useApiSubmit';

export const useGenerateSocialPost = () => {
  const [generatedPost, setGeneratedPost] = useState('');
  const { submitForm, loading, success, error } = useApiSubmit('/claude_social');

  const generatePost = useCallback(async (thema, details) => {
    try {
      const content = await submitForm({ thema, details });
      if (content) {
        setGeneratedPost(content);
        return content;
      }
    } catch (err) {
      console.error('Error generating post:', err);
      // Sie könnten hier auch den Fehler weitergeben, wenn Sie ihn in der Komponente behandeln möchten
    }
  }, [submitForm]);

  return {
    generatedPost,
    generatePost,
    loading,
    success,
    error
  };
};