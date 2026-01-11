/**
 * Hook for generating social media text from subtitles
 *
 * Takes subtitle content and generates social media post text using AI.
 * Now uses generic useApiAction hook with full type safety.
 *
 * Reduced from ~37 lines to ~18 lines by eliminating duplicate pattern.
 */

import { useApiAction } from './useApiAction';

interface GenerateSocialTextRequest {
  subtitles: string;
}

interface SocialTextResponse {
  content?: string;
}

/**
 * Hook for generating social media text from subtitles
 *
 * @example
 * ```typescript
 * const { socialText, isGenerating, error, generateSocialText } = useSocialTextGenerator();
 *
 * await generateSocialText(subtitleString);
 * console.log(socialText); // Generated social media text
 * ```
 */
export const useSocialTextGenerator = () => {
  const { data, loading, error, execute, reset } = useApiAction<
    GenerateSocialTextRequest,
    string
  >({
    endpoint: '/subtitler/generate-social',
    transformResponse: (response) => {
      // Extract content from API response
      if (typeof response === 'object' && response !== null) {
        const responseObj = response as SocialTextResponse;
        return responseObj.content || String(response);
      }
      return String(response);
    }
  });

  /**
   * Generate social text from subtitles
   */
  const generateSocialText = async (subtitles?: string): Promise<string | undefined> => {
    if (!subtitles) return undefined;
    return execute({ subtitles });
  };

  return {
    socialText: data || '',
    isGenerating: loading,
    error,
    generateSocialText,
    reset
  };
};

export default useSocialTextGenerator;
