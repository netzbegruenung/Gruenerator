/**
 * Hook-injection contract for the canvas AI suggestions feature.
 *
 * Operation / suggestion / snapshot / capability shapes are defined in
 * @gruenerator/contracts (Zod source of truth) and re-exported via the
 * package root. This file only declares the React hook shape that
 * consumers (apps/web etc.) implement and inject through
 * CanvasEditorProvider.services.useGenerateCanvasSuggestions.
 */
import type {
  CanvasAiCapabilities,
  CanvasAiSnapshot,
  CanvasAiSuggestion,
} from '@gruenerator/contracts';

export interface CanvasAiGenerateContext {
  canvasType: string;
  canvasState: CanvasAiSnapshot;
  /**
   * Per-template capability declaration the backend uses to filter
   * supported operations and build the LLM prompt context.
   * Pulled from the active template's TemplateAiCapabilities by AiSection.
   */
  capabilities: CanvasAiCapabilities;
}

export interface UseGenerateCanvasSuggestionsResult {
  suggestions: CanvasAiSuggestion[];
  loading: boolean;
  error: string | null;
  generate: (prompt: string, context: CanvasAiGenerateContext) => Promise<void>;
  clear: () => void;
}

export type UseGenerateCanvasSuggestions = () => UseGenerateCanvasSuggestionsResult;
