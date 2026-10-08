/**
 * Canvas-suggest LLM call — the one op planner. `runCanvasSuggest` serves the
 * chat loop's `edit_document` tool (`editorTools.ts`); `runCanvasEditDecision`
 * serves the chat's sharepic_edit intent (`sharepicEditService.ts`), which
 * had its own copy of prompt, retry and validation until #4251.
 *
 * This was a hand-rolled copy of the forced-tool-call pattern. It now runs on
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
  sharepicEditDecisionSchema,
  type CanvasAiOperation,
  type CanvasAiOperationKind,
  type CanvasAiSnapshot,
} from '@gruenerator/contracts';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { aiObject } from '../../../services/ai/generate.js';

import {
  buildCanvasSuggestSystemPrompt,
  buildCanvasSuggestUserMessage,
  TOOL_NAME,
  type CanvasSuggestCapabilitiesView,
  type CanvasSuggestChatEdit,
  type CanvasSuggestContextHints,
} from './buildCanvasSuggestPrompt.js';

import type { z } from 'zod';

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
  const result = await planBatch(args, {
    schema: canvasAiPlannedBatchSchema,
    chatEdit: null,
    toolDescription:
      'Reicht genau einen Stapel von Operationen samt kurzem Titel für den aktuellen Sharepic-Entwurf ein.',
    temperature: 0.3,
  });
  return result.ok
    ? { ok: true, operations: result.batch.operations, title: result.batch.title }
    : result;
}

export interface RunCanvasEditDecisionArgs extends RunCanvasSuggestArgs {
  chatEdit: CanvasSuggestChatEdit;
}

export type RunCanvasEditDecisionResult =
  | {
      ok: true;
      /** Empty only with a reply: a reasoned decline or a question back. */
      operations: CanvasAiOperation[];
      summary: string;
      reply: string;
      /** Operations of a kind this canvas does not support, dropped from `operations`. */
      dropped: CanvasAiOperation[];
    }
  | { ok: false; error: string };

/**
 * The chat's sharepic_edit planner: same prompt, schema gate and repair as
 * `runCanvasSuggest`, but the batch carries `summary` and `reply`, and an
 * empty batch is valid when the reply explains why. Dropped operations are
 * returned so the caller can name them instead of confirming them.
 */
export async function runCanvasEditDecision(
  args: RunCanvasEditDecisionArgs
): Promise<RunCanvasEditDecisionResult> {
  const result = await planBatch(args, {
    schema: sharepicEditDecisionSchema,
    chatEdit: args.chatEdit,
    toolDescription: 'Wendet eine Änderung auf das aktuelle Sharepic an.',
    temperature: 0.2,
  });
  if (!result.ok) return result;
  const { operations, summary, reply } = result.batch;
  return { ok: true, operations, summary, reply, dropped: result.dropped };
}

type PlannedBatch<T> =
  { ok: true; batch: T; dropped: CanvasAiOperation[] } | { ok: false; error: string };

async function planBatch<T extends { operations: CanvasAiOperation[] }>(
  args: RunCanvasSuggestArgs,
  opts: {
    schema: z.ZodType<T>;
    chatEdit: CanvasSuggestChatEdit | null;
    toolDescription: string;
    temperature: number;
  }
): Promise<PlannedBatch<T>> {
  const { prompt, snapshot, capabilities, contextHints, selectedElementIds, logTag } = args;
  const { schema, chatEdit } = opts;

  const rawSchema = zodToJsonSchema(schema, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  }) as Record<string, unknown>;

  const supported = capabilities.supportedOperations;

  const result = await aiObject<{ batch: T; dropped: CanvasAiOperation[] }>({
    lane: 'canvas_ai_suggest',
    system: buildCanvasSuggestSystemPrompt(
      snapshot,
      capabilities,
      contextHints,
      selectedElementIds,
      chatEdit
    ),
    prompt: buildCanvasSuggestUserMessage(prompt),
    toolName: TOOL_NAME,
    toolDescription: opts.toolDescription,
    schema: rawSchema,
    temperature: opts.temperature,
    label: logTag ?? 'canvas_ai_suggest',
    validate: (input) => {
      const parsed = schema.safeParse(input);
      if (!parsed.success) {
        return {
          ok: false,
          error: `Schema mismatch: ${parsed.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ')}`,
        };
      }

      const proposed = parsed.data.operations;
      const operations = proposed.filter((op) => isSupported(op, supported));
      // An empty batch passed the schema only where it may: the chat decision
      // schema demands a reply with it. A non-empty batch of which nothing
      // survives is a different thing — the model meant to change something.
      if (proposed.length > 0 && operations.length === 0) {
        return {
          ok: false,
          error:
            'Der Stapel enthält keine unterstützte Operation. ' +
            `Erlaubt sind ausschließlich: ${supported.join(', ')}.` +
            (chatEdit
              ? ' Lässt sich die Anweisung damit nicht umsetzen, gib "operations": [] zurück und erkläre es in "reply".'
              : ''),
        };
      }
      return {
        ok: true,
        value: {
          batch: { ...parsed.data, operations },
          dropped: proposed.filter((op) => !isSupported(op, supported)),
        },
      };
    },
  });

  return result.ok
    ? { ok: true, batch: result.data.batch, dropped: result.data.dropped }
    : { ok: false, error: result.error };
}

function isSupported(op: CanvasAiOperation, supported: ReadonlyArray<string>): boolean {
  return supported.includes(op.kind as CanvasAiOperationKind);
}
