/**
 * Hook for generating social media text from subtitles
 *
 * Takes subtitle content and generates social media post text using AI
 * via the ts-rest contract client (`subtitler.generateSocial`).
 */

import { getContractsClient } from '@gruenerator/shared/api';
import { useState, useCallback } from 'react';

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
  const [socialText, setSocialText] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const generateSocialText = useCallback(
    async (subtitles?: string): Promise<string | undefined> => {
      if (!subtitles) return undefined;
      setIsGenerating(true);
      setError(null);
      try {
        const res = await getContractsClient().subtitler.generateSocial({ body: { subtitles } });
        if (res.status !== 200) {
          throw new Error(
            (res.body as { error?: string })?.error ?? 'Fehler bei der Erstellung des Textes'
          );
        }
        const content = res.body.content;
        setSocialText(content);
        return content;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Fehler bei der Erstellung des Textes');
        return undefined;
      } finally {
        setIsGenerating(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setSocialText('');
    setError(null);
    setIsGenerating(false);
  }, []);

  return {
    socialText,
    isGenerating,
    error,
    generateSocialText,
    reset,
  };
};

export default useSocialTextGenerator;
