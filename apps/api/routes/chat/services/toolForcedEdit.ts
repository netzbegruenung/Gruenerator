/**
 * One tool-forced LLM call that must come back as a schema-valid tool input.
 *
 * Shared by the sharepic and reel edit branches, which had byte-identical
 * drivers differing only in tool name, description, response schema and log
 * prefix. The parts worth having in one place are the failure handling: the
 * retry policy, the two ways a provider can hand back a tool call
 * (`tool_calls` vs `raw_content_blocks`), and the truncated schema-mismatch
 * report that makes a bad model response debuggable.
 */

import { jsonSchema } from 'ai';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { aiTools } from '../../../services/ai/generate.js';
import { createLogger } from '../../../utils/logger.js';

import type { AiResult, Tool } from '../../../services/ai/types.js';
import type { z } from 'zod';

const log = createLogger('toolForcedEdit');

const DEFAULT_MAX_ATTEMPTS = 2;

export type ToolForcedEditResult<T> = { ok: true; edit: T } | { ok: false; error: string };

export interface RunToolForcedEditParams<T> {
  toolName: string;
  /** Tool description shown to the model. */
  description: string;
  schema: z.ZodType<T>;
  systemPrompt: string;
  /** The user's natural-language edit request. */
  instruction: string;
  /** Log prefix, e.g. '[reel_edit]'. */
  logPrefix: string;
  maxAttempts?: number;
}

function extractToolCall(result: AiResult, toolName: string): Record<string, unknown> | null {
  if (result.tool_calls) {
    const match = result.tool_calls.find((c) => c.name === toolName);
    if (match) return match.input;
  }
  if (result.raw_content_blocks) {
    for (const block of result.raw_content_blocks) {
      if (block.type === 'tool_use' && block.name === toolName && block.input) {
        return block.input;
      }
    }
  }
  return null;
}

export async function runToolForcedEdit<T>({
  toolName,
  description,
  schema,
  systemPrompt,
  instruction,
  logPrefix,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
}: RunToolForcedEditParams<T>): Promise<ToolForcedEditResult<T>> {
  const userMessage =
    `Setze JETZT diese Änderung mit dem Tool ${toolName} um:\n\n${instruction}\n\n` +
    'Antworte ausschließlich über den Tool-Aufruf — keinen Begleittext.';

  // jsonSchema() wrapping is required — the AI SDK's asSchema helper rejects
  // raw JSON-Schema objects.
  const rawSchema = zodToJsonSchema(schema, { target: 'jsonSchema7', $refStrategy: 'none' });
  const tool: Tool = {
    name: toolName,
    description,
    input_schema: jsonSchema(
      rawSchema as Parameters<typeof jsonSchema>[0]
    ) as unknown as Tool['input_schema'],
  };

  let lastError = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await aiTools({
        lane: 'canvas_ai_suggest',
        system: systemPrompt,
        prompt: userMessage,
        tools: [tool],
        toolChoice: 'required',
        temperature: 0.2,
      });

      const toolInput = extractToolCall(result, toolName);
      if (!toolInput) {
        lastError = 'No tool call in response';
        log.warn(
          `${logPrefix} attempt ${attempt}: no tool call (stop_reason=${result.stop_reason ?? 'unknown'})`
        );
        continue;
      }

      const parsed = schema.safeParse(toolInput);
      if (!parsed.success) {
        lastError = `Schema mismatch: ${parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`;
        log.warn(
          `${logPrefix} attempt ${attempt}: ${lastError}\n  raw: ${JSON.stringify(toolInput).slice(0, 600)}`
        );
        continue;
      }

      return { ok: true, edit: parsed.data };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      log.error(`${logPrefix} attempt ${attempt} threw: ${lastError}`);
    }
  }

  return { ok: false, error: lastError || 'unknown error' };
}
