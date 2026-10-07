/**
 * Canvas-suggest LLM call — planner behind the chat loop's `edit_document`
 * tool (`editorTools.ts`), its only caller now that `aiSuggestRoute.ts` (the
 * dead studio "KI" tab's endpoint) has been removed. The streaming chat-edit
 * controller that used to share this retry/validation/filtering logic has
 * also been removed.
 *
 * This was the third hand-rolled copy of the forced-tool-call pattern
 * (alongside sharepicEditLlm and the artifact generators). It now runs on
 * `aiObject`, which owns that pattern — with one behavioural gain:
 * the second attempt used to be a blind retry that re-sent the identical
 * prompt, so a model that omitted a required field had no reason to do
 * anything different. `aiObject` feeds the invalid payload and the
 * concrete validation error back at temperature 0 instead.
 *
 * Operation filtering lives in the `validate` callback rather than after the
 * call. That placement is load-bearing: a batch whose operations are
 * all unsupported by this canvas is useless, and as a validation error it now
 * drives a repair turn that names the supported kinds — previously it silently
 * returned an empty list.
 */
import {
  canvasAiPlannedBatchSchema,
  type CanvasAiOperation,
  type CanvasAiOperationKind,
  type CanvasAiPlannedBatch,
  type CanvasAiSnapshot,
} from '@gruenerator/contracts';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { aiObject } from '../../../services/ai/generate.js';

import {
  buildCanvasSuggestSystemPrompt,
  buildCanvasSuggestUserMessage,
  TOOL_NAME,
  type CanvasSuggestCapabilitiesView,
  type CanvasSuggestContextHints,
} from './buildCanvasSuggestPrompt.js';

export interface RunCanvasSuggestArgs {
  prompt: string;
  snapshot: CanvasAiSnapshot;
  capabilities: CanvasSuggestCapabilitiesView;
  contextHints?: CanvasSuggestContextHints;
  /** Element ids the user selected on the canvas; the instruction targets them. */
  selectedElementIds?: readonly string[] | null;
  /** Tag prefix for log lines. Defaults to 'canvas_ai_suggest'. */
  logTag?: string;
}

export type RunCanvasSuggestResult =
  { ok: true; operations: CanvasAiOperation[]; title: string } | { ok: false; error: string };

export async function runCanvasSuggest(
  args: RunCanvasSuggestArgs
): Promise<RunCanvasSuggestResult> {
  const { prompt, snapshot, capabilities, contextHints, selectedElementIds, logTag } = args;

  const rawSchema = zodToJsonSchema(canvasAiPlannedBatchSchema, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  }) as Record<string, unknown>;

  const supported = capabilities.supportedOperations;

  const result = await aiObject<CanvasAiPlannedBatch>({
    lane: 'canvas_ai_suggest',
    system: buildCanvasSuggestSystemPrompt(
      snapshot,
      capabilities,
      contextHints,
      selectedElementIds
    ),
    prompt: buildCanvasSuggestUserMessage(prompt),
    toolName: TOOL_NAME,
    toolDescription:
      'Reicht genau einen Stapel von Operationen samt kurzem Titel für den aktuellen Sharepic-Entwurf ein.',
    schema: rawSchema,
    temperature: 0.3,
    label: logTag ?? 'canvas_ai_suggest',
    validate: (input) => {
      const parsed = canvasAiPlannedBatchSchema.safeParse(input);
      if (!parsed.success) {
        return {
          ok: false,
          error: `Schema mismatch: ${parsed.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ')}`,
        };
      }

      const operations = parsed.data.operations.filter((op) => isSupported(op, supported));
      if (operations.length === 0) {
        return {
          ok: false,
          error:
            'Der Stapel enthält keine unterstützte Operation. ' +
            `Erlaubt sind ausschließlich: ${supported.join(', ')}.`,
        };
      }
      return { ok: true, value: { title: parsed.data.title, operations } };
    },
  });

  return result.ok
    ? { ok: true, operations: result.data.operations, title: result.data.title }
    : { ok: false, error: result.error };
}

function isSupported(op: CanvasAiOperation, supported: ReadonlyArray<string>): boolean {
  return supported.includes(op.kind as CanvasAiOperationKind);
}
