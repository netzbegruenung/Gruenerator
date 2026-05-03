import { useCallback, useEffect, useState } from 'react';

import { useCanvasEditorServices } from '../CanvasEditorProvider';

export type AiVariant = 'illustration' | 'realistic' | 'pixel';

export interface GeneratedAiImage {
  file: File;
  objectUrl: string;
}

export interface UseAiBackgroundGenerationReturn {
  generatedImage: GeneratedAiImage | null;
  remaining: number | null;
  isGenerating: boolean;
  generationError: string | null;
  lastPrompt: string;
  generate: (prompt: string, variant: AiVariant) => Promise<GeneratedAiImage | null>;
  clear: () => void;
}

export function useAiBackgroundGeneration(): UseAiBackgroundGenerationReturn {
  const { generateAiBackgroundImage } = useCanvasEditorServices();

  const [generatedImage, setGeneratedImage] = useState<GeneratedAiImage | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [lastPrompt, setLastPrompt] = useState('');

  useEffect(() => {
    return () => {
      if (generatedImage) {
        URL.revokeObjectURL(generatedImage.objectUrl);
      }
    };
  }, [generatedImage]);

  const generate = useCallback(
    async (prompt: string, variant: AiVariant): Promise<GeneratedAiImage | null> => {
      const trimmed = prompt.trim();
      if (!trimmed) {
        setGenerationError('Bitte gib eine Bildbeschreibung ein.');
        return null;
      }
      if (!generateAiBackgroundImage) {
        setGenerationError('KI-Bildgenerierung ist in dieser Umgebung nicht verfügbar.');
        return null;
      }

      setIsGenerating(true);
      setGenerationError(null);
      setLastPrompt(trimmed);

      try {
        const { file, remaining: nextRemaining } = await generateAiBackgroundImage(trimmed, {
          variant,
        });
        const objectUrl = URL.createObjectURL(file);
        const next: GeneratedAiImage = { file, objectUrl };
        setGeneratedImage((prev) => {
          if (prev) URL.revokeObjectURL(prev.objectUrl);
          return next;
        });
        setRemaining(nextRemaining);
        return next;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Fehler bei der Bildgenerierung';
        setGenerationError(message);
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [generateAiBackgroundImage]
  );

  const clear = useCallback(() => {
    setGeneratedImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.objectUrl);
      return null;
    });
    setGenerationError(null);
    setLastPrompt('');
  }, []);

  return {
    generatedImage,
    remaining,
    isGenerating,
    generationError,
    lastPrompt,
    generate,
    clear,
  };
}
