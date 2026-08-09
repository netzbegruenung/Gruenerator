/**
 * Canvas-suggest LLM call — extracted from `aiSuggestRoute.ts`, which is now
 * its only caller. The streaming chat-edit controller that used to share this
 * retry/validation/filtering logic has been removed.
 *
 * This was the third hand-rolled copy of the forced-tool-call pattern
 * (alongside sharepicEditLlm and the artifact generators). It now runs on
 * `generateStructured`, which owns that pattern — with one behavioural gain:
 * the second attempt used to be a blind retry that re-sent the identical
 * prompt, so a model that omitted a required field had no reason to do
 * anything different. `generateStructured` feeds the invalid payload and the
 * concrete validation error back at temperature 0 instead.
 *
 * Operation filtering lives in the `validate` callback rather than after the
 * call. That placement is load-bearing: a suggestion set whose operations are
 * all unsupported by this canvas is useless, and as a validation error it now
 * drives a repair turn that names the supported kinds — previously it silently
 * returned an empty list.
 */
import {
  canvasAiSuggestResponseSchema,
  type CanvasAiOperation,
  type CanvasAiOperationKind,
  type CanvasAiSnapshot,
  type CanvasAiSuggestion,
} from '@gruenerator/contracts';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { generateStructured } from '../../../services/ai/generateStructured.js';

import {
  buildCanvasSuggestSystemPrompt,
  buildCanvasSuggestUserMessage,
  TOOL_NAME,
  type CanvasSuggestCapabilitiesView,
  type CanvasSuggestContextHints,
} from './buildCanvasSuggestPrompt.js';

import type { AIWorkerPool } from '../../../workers/types.js';

export interface RunCanvasSuggestArgs {
  prompt: string;
  snapshot: CanvasAiSnapshot;
  capabilities: CanvasSuggestCapabilitiesView;
  contextHints?: CanvasSuggestContextHints;
  aiWorkerPool: AIWorkerPool;
  /** Optional Express request — passed through for tracing/correlation. */
  req?: unknown;
  /** Tag prefix for log lines. Defaults to 'canvas_ai_suggest'. */
  logTag?: string;
}

export type RunCanvasSuggestResult =
  { ok: true; suggestions: CanvasAiSuggestion[] } | { ok: false; error: string };

export async function runCanvasSuggest(
  args: RunCanvasSuggestArgs
): Promise<RunCanvasSuggestResult> {
  const { prompt, snapshot, capabilities, contextHints, aiWorkerPool, req, logTag } = args;

  const rawSchema = zodToJsonSchema(canvasAiSuggestResponseSchema, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  }) as Record<string, unknown>;

  const supported = capabilities.supportedOperations;

  const result = await generateStructured<CanvasAiSuggestion[]>({
    aiWorkerPool,
    ...(req !== undefined && { req }),
    type: 'canvas_ai_suggest',
    systemPrompt: buildCanvasSuggestSystemPrompt(snapshot, capabilities, contextHints),
    userContent: buildCanvasSuggestUserMessage(prompt),
    toolName: TOOL_NAME,
    toolDescription:
      'Reicht 3 bis 5 konkrete Vorschläge zur Verbesserung des aktuellen Sharepic-Entwurfs ein.',
    schema: rawSchema,
    temperature: 0.3,
    label: logTag ?? 'canvas_ai_suggest',
    validate: (input) => {
      const parsed = canvasAiSuggestResponseSchema.safeParse(input);
      if (!parsed.success) {
        return {
          ok: false,
          error: `Schema mismatch: ${parsed.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ')}`,
        };
      }

      const filtered = filterSuggestions(parsed.data.suggestions, supported);
      if (filtered.length === 0) {
        return {
          ok: false,
          error:
            'Keiner der Vorschläge enthält eine unterstützte Operation. ' +
            `Erlaubt sind ausschließlich: ${supported.join(', ')}.`,
        };
      }
      return { ok: true, value: filtered };
    },
  });

  return result.ok ? { ok: true, suggestions: result.data } : { ok: false, error: result.error };
}

function isSupported(op: CanvasAiOperation, supported: ReadonlyArray<string>): boolean {
  return supported.includes(op.kind as CanvasAiOperationKind);
}

function filterSuggestions(
  suggestions: CanvasAiSuggestion[],
  supported: ReadonlyArray<string>
): CanvasAiSuggestion[] {
  return suggestions
    .map((s) => ({
      ...s,
      operations: s.operations.filter((op) => isSupported(op, supported)),
    }))
    .filter((s) => s.operations.length > 0);
}
