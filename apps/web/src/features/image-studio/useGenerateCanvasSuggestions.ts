/**
 * useGenerateCanvasSuggestions
 *
 * Frontend implementation of the canvas-editor service hook contract.
 * Hits POST /api/canvas/ai-suggest. Request and response types are
 * imported from @gruenerator/contracts so a schema change there forces
 * a type error here.
 *
 * Injected into the canvas editor via CanvasEditorProvider.services.
 * If this implementation is not provided, the AiSection renders a
 * "not configured" hint instead of any UI.
 *
 * Capabilities (which operations / color schemes / assets the template
 * supports) flow through the generate() context — they are owned by the
 * per-template TemplateAiCapabilities declaration in canvas-editor, not
 * hardcoded here. Adding a new template needs zero changes to this file.
 */
import {
  canvasAiSuggestResponseSchema,
  type CanvasAiSuggestRequest,
  type CanvasAiSuggestion,
} from '@gruenerator/contracts';
import { useCallback, useState } from 'react';

import type {
  CanvasAiGenerateContext,
  UseGenerateCanvasSuggestionsResult,
} from '@gruenerator/canvas-editor';

const API_BASE =
  (import.meta as unknown as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL ||
  '/api';

const ENDPOINT = `${API_BASE.replace(/\/$/, '')}/canvas/ai-suggest`;

export function useGenerateCanvasSuggestions(): UseGenerateCanvasSuggestionsResult {
  const [suggestions, setSuggestions] = useState<CanvasAiSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (prompt: string, context: CanvasAiGenerateContext) => {
    setLoading(true);
    setError(null);
    setSuggestions([]);

    const body: CanvasAiSuggestRequest = {
      prompt,
      snapshot: context.canvasState,
      capabilities: context.capabilities,
    };

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (res.status === 429) {
        setError('Tageslimit für KI-Vorschläge erreicht.');
        return;
      }
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(json?.error ?? `Fehler ${res.status}`);
        return;
      }

      const raw: unknown = await res.json();
      const parsed = canvasAiSuggestResponseSchema.safeParse(raw);
      if (!parsed.success) {
        setError('Antwort vom Server hat unerwartetes Format.');
        return;
      }

      setSuggestions(parsed.data.suggestions);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setSuggestions([]);
    setError(null);
  }, []);

  return { suggestions, loading, error, generate, clear };
}
