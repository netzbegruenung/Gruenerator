import { type SiteGenerationEvent, type SiteGenerationStep } from '@gruenerator/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { transformAiResponse, type GeneratedSiteData } from '../generation/transform';
import { streamSiteGeneration, type SiteGenerationInput } from '../generation/siteGenerationStream';

export function useSiteGeneration() {
  const [steps, setSteps] = useState<readonly SiteGenerationStep[]>([]);
  const [current, setCurrent] = useState<SiteGenerationStep | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFlyer, setIsFlyer] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    },
    []
  );

  const generate = useCallback(
    async (input: SiteGenerationInput, email: string): Promise<GeneratedSiteData> => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setSteps([]);
      setCurrent(null);
      setIsFlyer('file' in input);
      setIsGenerating(true);

      const onEvent = (event: SiteGenerationEvent) => {
        if (event.type === 'start') setSteps(event.steps);
        else if (event.type === 'step') setCurrent(event.step);
      };

      try {
        const content = await streamSiteGeneration(input, email, onEvent, controller.signal);
        return transformAiResponse(content);
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          if (mountedRef.current) setIsGenerating(false);
        }
      }
    },
    []
  );

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setIsGenerating(false);
  }, []);

  return { generate, cancel, steps, current, isGenerating, isFlyer };
}
