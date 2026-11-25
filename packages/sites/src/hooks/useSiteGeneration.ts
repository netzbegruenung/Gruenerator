import {
  type SiteContentDraft,
  type SiteGenerationEvent,
  type SiteGenerationStep,
} from '@gruenerator/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { streamSiteGeneration, type SiteGenerationInput } from '../generation/siteGenerationStream';
import { transformAiResponse, type GeneratedSiteData } from '../generation/transform';

export function useSiteGeneration() {
  const [steps, setSteps] = useState<readonly SiteGenerationStep[]>([]);
  const [current, setCurrent] = useState<SiteGenerationStep | null>(null);
  /** The page as far as it is written; stays after `done` so the preview holds while the site is created. */
  const [draft, setDraft] = useState<SiteContentDraft | null>(null);
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
      setDraft(null);
      setIsFlyer('file' in input);
      setIsGenerating(true);

      const onEvent = (event: SiteGenerationEvent) => {
        if (event.type === 'start') setSteps(event.steps);
        else if (event.type === 'step') setCurrent(event.step);
        else if (event.type === 'partial') setDraft(event.content);
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
    setDraft(null);
  }, []);

  return { generate, cancel, steps, current, isGenerating, isFlyer, draft };
}
