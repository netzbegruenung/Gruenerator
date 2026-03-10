import { useState, useCallback } from 'react';

import useApiSubmit from './useApiSubmit';

export const useGenerateSocialPost = () => {
  const [generatedPosts, setGeneratedPosts] = useState<Record<string, unknown>>({});
  const { submitForm, loading, error } = useApiSubmit('/claude_social');

  const generatePost = useCallback(
    async (
      thema: string,
      details: string,
      platforms: string[],
      includeActionIdeas: boolean
    ): Promise<Record<string, unknown>> => {
      try {
        const response = await submitForm({ thema, details, platforms, includeActionIdeas });
        if (response) {
          const posts: Record<string, unknown> = {};
          const content = response.content || response;
          if (platforms && platforms.length > 0) {
            platforms.forEach((platform) => {
              posts[platform] = content;
            });
          }
          setGeneratedPosts(posts);
          return posts;
        }
        return {};
      } catch (err) {
        console.error('Fehler beim Generieren der Posts:', err);
        throw err;
      }
    },
    [submitForm]
  );

  return {
    generatedPosts,
    generatePost,
    loading,
    error,
  };
};
