/**
 * Canvas-suggest LLM call — extracted from `aiSuggestRoute.ts` so the
 * same retry/validation/filtering logic powers both the synchronous
 * route and the streaming chat-edit controller.
 */
import {
  canvasAiSuggestResponseSchema,
  type CanvasAiOperation,
  type CanvasAiOperationKind,
  type CanvasAiSnapshot,
  type CanvasAiSuggestion,
} from '@gruenerator/contracts';
import { jsonSchema } from 'ai';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { createLogger } from '../../../utils/logger.js';

import {
  buildCanvasSuggestSystemPrompt,
  buildCanvasSuggestUserMessage,
  TOOL_NAME,
  type CanvasSuggestCapabilitiesView,
  type CanvasSuggestContextHints,
} from './buildCanvasSuggestPrompt.js';

import type { AIWorkerPool, AIWorkerResult, Tool } from '../../../workers/types.js';

const log = createLogger('canvasAiSuggest');

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
  | { ok: true; suggestions: CanvasAiSuggestion[] }
  | { ok: false; error: string };

const MAX_ATTEMPTS = 2;

export async function runCanvasSuggest(
  args: RunCanvasSuggestArgs
): Promise<RunCanvasSuggestResult> {
  const { prompt, snapshot, capabilities, contextHints, aiWorkerPool, req, logTag } = args;
  const tag = logTag ?? 'canvas_ai_suggest';

  const systemPrompt = buildCanvasSuggestSystemPrompt(snapshot, capabilities, contextHints);
  const userMessage = buildCanvasSuggestUserMessage(prompt);

  // zod-to-json-schema returns a plain JSON Schema 7 object. The Vercel
  // AI SDK's `asSchema` helper expects a Zod schema OR a `Schema` object
  // wrapped via `jsonSchema()` — passing the raw JSON Schema causes
  // `TypeError: schema is not a function` at the adapter boundary.
  const rawSchema = zodToJsonSchema(canvasAiSuggestResponseSchema, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  });
  const wrappedSchema = jsonSchema(rawSchema as Parameters<typeof jsonSchema>[0]);

  const tool: Tool = {
    name: TOOL_NAME,
    description:
      'Reicht 3 bis 5 konkrete Vorschläge zur Verbesserung des aktuellen Sharepic-Entwurfs ein.',
    input_schema: wrappedSchema as unknown as Tool['input_schema'],
  };

  let attempt = 0;
  let lastError = '';

  while (attempt < MAX_ATTEMPTS) {
    attempt++;
    try {
      const result = await aiWorkerPool.processRequest(
        {
          type: 'canvas_ai_suggest',
          systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
          options: {
            tools: [tool],
            tool_choice: 'required',
            temperature: 0.3,
          },
        },
        req
      );

      if (!result.success) {
        lastError = result.error || 'AI request failed';
        log.warn(`[${tag}] attempt ${attempt} provider error: ${lastError}`);
        continue;
      }

      const toolInput = extractToolCall(result);
      if (!toolInput) {
        lastError = 'No tool call in response';
        const contentPreview = (result.content ?? '').slice(0, 400);
        log.warn(
          `[${tag}] attempt ${attempt}: no tool call (stop_reason=${result.stop_reason ?? 'unknown'}) content="${contentPreview}"`
        );
        continue;
      }

      const parsed = canvasAiSuggestResponseSchema.safeParse(toolInput);
      if (!parsed.success) {
        lastError = `Schema mismatch: ${parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`;
        const rawPreview = JSON.stringify(toolInput).slice(0, 800);
        log.warn(`[${tag}] attempt ${attempt}: ${lastError}\n  raw payload: ${rawPreview}`);
        continue;
      }

      const filtered = filterSuggestions(parsed.data.suggestions, capabilities.supportedOperations);
      return { ok: true, suggestions: filtered };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      log.error(`[${tag}] attempt ${attempt} threw: ${lastError}`);
    }
  }

  return { ok: false, error: lastError || 'unknown error' };
}

function extractToolCall(result: AIWorkerResult): Record<string, unknown> | null {
  if (result.tool_calls) {
    const match = result.tool_calls.find((c) => c.name === TOOL_NAME);
    if (match) return match.input;
  }
  if (result.raw_content_blocks) {
    for (const block of result.raw_content_blocks) {
      if (block.type === 'tool_use' && block.name === TOOL_NAME && block.input) {
        return block.input;
      }
    }
  }
  return null;
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
