/**
 * One forced single tool call on the facade, shared by the editor op planners
 * (board/sheet/presentation, behind the agentic loop's `edit_document` tool,
 * #3426).
 *
 * The three planners independently built the same three things around
 * `aiTools()`: a JSON-Schema tool converted from a zod schema (the facade's
 * `Tool.input_schema` is a plain schema, not something the AI SDK's zod
 * integration accepts directly), a 2-attempt loop that retries once on a
 * provider failure or a response without the forced tool call, and the
 * tool-call extraction across the two transport shapes an adapter can answer
 * in (`tool_calls` vs `raw_content_blocks`). Extracted here so a fourth
 * surface does not copy it a third time.
 *
 * `routes/chat/services/toolForcedEdit.ts` is a close relative with the same
 * shape (same retry count, same extraction) but a different contract —
 * `{ok, error}` plus its own caller-side zod validation and repair-echo — and
 * its own tests. Left untouched rather than folded in here; it is the
 * remaining second copy of this pattern and a follow-up candidate.
 *
 * What this does NOT do: validate the tool input against a schema. The
 * `inputSchema` here only describes the tool to the model; each caller keeps
 * its own post-call validation (a whole-array `safeParse` for boards, a
 * per-op drop-and-keep for sheet/presentation) because the failure semantics
 * genuinely differ between them.
 */

import { jsonSchema } from 'ai';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { createLogger } from '../../utils/logger.js';

import { aiTools } from './generate.js';

import type { AiCall } from './generate.js';
import type { LaneId } from './lanes.js';
import type { Tool } from './types.js';
import type { z } from 'zod';

const log = createLogger('ForcedToolCall');

export interface ForcedToolCallOptions {
  lane: LaneId | string;
  system?: string;
  prompt?: string;
  /** For multi-turn callers; mutually usable with `prompt` the same way `AiCall` allows. */
  messages?: AiCall['messages'];
  toolName: string;
  toolDescription: string;
  /** Describes the tool to the model — NOT used to validate the result. */
  inputSchema: z.ZodType<unknown>;
  temperature?: number;
  /** Total attempts, i.e. one retry by default — matches the previous per-planner loops. */
  attempts?: number;
}

const DEFAULT_ATTEMPTS = 2;

/** The tool call by NAME, in either transport shape the adapters produce. */
function extractToolInput(
  result: Awaited<ReturnType<typeof aiTools>>,
  toolName: string
): Record<string, unknown> | null {
  const call = result.tool_calls?.find((c) => c.name === toolName);
  if (call) return call.input;
  for (const block of result.raw_content_blocks ?? []) {
    if (block.type === 'tool_use' && block.name === toolName && block.input) return block.input;
  }
  return null;
}

/**
 * Force a single named tool call and return its raw input, or `null` if no
 * attempt produced one. Throws (re-throws) the facade's own error
 * (`NoAnswerError`/`AiProviderError`) once every attempt has failed with one.
 */
export async function runForcedToolCall(
  opts: ForcedToolCallOptions
): Promise<Record<string, unknown> | null> {
  const {
    lane,
    system,
    prompt,
    messages,
    toolName,
    toolDescription,
    inputSchema,
    temperature,
    attempts = DEFAULT_ATTEMPTS,
  } = opts;

  // jsonSchema() wrapping is required — the AI SDK's asSchema helper rejects
  // raw JSON-Schema objects.
  const rawSchema = zodToJsonSchema(inputSchema, { target: 'jsonSchema7', $refStrategy: 'none' });
  const tool: Tool = {
    name: toolName,
    description: toolDescription,
    input_schema: jsonSchema(
      rawSchema as Parameters<typeof jsonSchema>[0]
    ) as unknown as Tool['input_schema'],
  };

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await aiTools({
        lane,
        ...(system != null && { system }),
        ...(prompt != null && { prompt }),
        ...(messages != null && { messages }),
        tools: [tool],
        toolChoice: 'required',
        ...(temperature != null && { temperature }),
      });
      const toolInput = extractToolInput(result, toolName);
      if (toolInput) return toolInput;
      log.warn(
        `[${toolName}] attempt ${attempt}: no tool call (stop_reason=${result.stop_reason ?? 'unknown'})`
      );
    } catch (e) {
      if (attempt === attempts) throw e;
      log.warn(
        `[${toolName}] attempt ${attempt} threw: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  return null;
}
