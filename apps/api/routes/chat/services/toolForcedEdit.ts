/**
 * Chat-side adapter over `services/ai/forcedToolCall.ts`'s `runForcedToolCall`.
 *
 * The shared parts — building the tool from a zod schema, retrying once on a
 * provider failure or a response without the forced tool call, and
 * extracting the call across the two transport shapes a provider can answer
 * in (`tool_calls` vs `raw_content_blocks`) — now live there.
 *
 * What stays here is the chat-side contract: the `{ok, error}` result type,
 * the fixed German user message, the `canvas_ai_suggest` lane, and the
 * schema retry — a schema mismatch counts as a failed attempt here, which the
 * shared helper does not validate for.
 */

import { runForcedToolCall } from '../../../services/ai/forcedToolCall.js';
import { createLogger } from '../../../utils/logger.js';

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

  let lastError = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // One helper attempt per driver attempt: the shared helper retries only on
    // a provider error or a missing tool call and never validates, whereas
    // here a schema mismatch counts as a failed attempt too. The attempt
    // budget therefore lives in this loop, not in the helper's.
    let toolInput: Record<string, unknown> | null;
    try {
      toolInput = await runForcedToolCall({
        lane: 'canvas_ai_suggest',
        system: systemPrompt,
        prompt: userMessage,
        toolName,
        toolDescription: description,
        inputSchema: schema,
        temperature: 0.2,
        attempts: 1,
      });
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      log.error(`${logPrefix} attempt ${attempt} threw: ${lastError}`);
      continue;
    }

    if (!toolInput) {
      lastError = 'No tool call in response';
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
  }

  return { ok: false, error: lastError || 'unknown error' };
}
