import { useState, useCallback } from 'react';
import useApiSubmit from './useApiSubmit';

export const useGenerateSocialPost = () => {
  const [generatedPosts, setGeneratedPosts] = useState({});
  const { submitForm, loading, error } = useApiSubmit('/claude_social');

  const generatePost = useCallback(async (thema, details, platforms, includeActionIdeas) => {
    try {
      const response = await submitForm({ thema, details, platforms, includeActionIdeas });
      if (response) {
        // Map content to platform keys
        const posts = {};
        const content = response.content || response;
        if (platforms && platforms.length > 0) {
          platforms.forEach(platform => {
            posts[platform] = content;
          });
        }
        setGeneratedPosts(posts);
        return posts;
      }
    } catch (err) {
      console.error('Fehler beim Generieren der Posts:', err);
      throw err;
    }
  }, [submitForm]);

  return {
    generatedPosts,
    generatePost,
    loading,
    error
  };
};
