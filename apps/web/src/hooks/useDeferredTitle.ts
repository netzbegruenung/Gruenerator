import { useEffect } from 'react';

import apiClient from '../components/utils/apiClient';
import useGeneratedTextStore from '../stores/core/generatedTextStore';

import type { ContentMetadata } from '@/types/baseform';

const pendingTitles = new Map<string, Promise<string | null>>();

/**
 * Await the in-flight title generation for a component.
 * Returns the AI title if one arrives, or null if none is pending / it times out.
 * Safe to call from any context (action handlers, callbacks, etc.).
 */
export function awaitDeferredTitle(componentName: string): Promise<string | null> {
  const pending = pendingTitles.get(componentName);
  if (!pending) return Promise.resolve(null);
  return Promise.race([
    pending,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
  ]);
}

/**
 * Fires a lightweight deferred API call to generate an AI title
 * when the current title was produced by the rule-based `generateSmartTitle()`.
 *
 * Skips when streaming is active or the title was already extracted / AI-generated.
 * Stores the in-flight promise so action handlers can `await awaitDeferredTitle()`
 * before committing irreversible actions (save, download, etc.).
 */
export function useDeferredTitle(
  componentName: string,
  exportableContent: string,
  metadata: ContentMetadata | null,
  isStreaming: boolean
): void {
  const setGeneratedTextMetadata = useGeneratedTextStore((state) => state.setGeneratedTextMetadata);

  useEffect(() => {
    if (!exportableContent || !metadata || metadata.titleSource !== 'smart' || isStreaming) {
      return;
    }

    let cancelled = false;

    const promise = apiClient
      .post('/generate-content-title', {
        content: exportableContent.slice(0, 500),
        contentType: metadata.contentType || 'universal',
      })
      .then((response) => {
        const aiTitle: string | null = response.data?.title || null;
        if (!cancelled) {
          setGeneratedTextMetadata(componentName, {
            ...metadata,
            title: aiTitle || metadata.title,
            titleSource: 'ai' as const,
          });
        }
        return aiTitle;
      })
      .catch(() => {
        if (!cancelled) {
          setGeneratedTextMetadata(componentName, {
            ...metadata,
            titleSource: 'ai' as const,
          });
        }
        return null;
      })
      .finally(() => {
        pendingTitles.delete(componentName);
      });

    pendingTitles.set(componentName, promise);

    return () => {
      cancelled = true;
    };
  }, [
    componentName,
    metadata?.titleSource,
    exportableContent,
    isStreaming,
    setGeneratedTextMetadata,
    metadata,
  ]);
}
