/**
 * Schema-enforced structure generation for the create_* artifact kinds.
 *
 * Background: artifact generators used to prompt for JSON and parse whatever
 * came back. When the model omitted a required field the parse failed, the
 * generator returned null, and the turn degraded into free prose — which then
 * became the input of the NEXT artifact. Prompting alone cannot prevent that.
 *
 * The AI worker pool cannot do constrained decoding: `AIRequestOptions.
 * response_format` is declared but no adapter reads it, so every "JSON mode" in
 * the pool is prompt-only. What the pool CAN do is a forced tool call
 * (`options.tools` + `tool_choice: 'required'`), which several services already
 * use as de-facto structured output — see runSharepicEdit (sharepicEditLlm.ts)
 * and runCanvasSuggest. This is that pattern, generalized, plus two additions:
 *
 *  - a REPAIR turn: the invalid output and the concrete validation error are
 *    fed back at temperature 0 ("field X missing — return it corrected"), which
 *    is what actually recovers a missing required field;
 *  - a TEXT fallback: a provider that ignores tools and answers with prose is
 *    handed to the caller's existing lax parser before the attempt counts as
 *    failed, so the new behaviour is a strict superset of the old one and no
 *    provider can regress.
 */

import { jsonSchema } from 'ai';

import { createLogger } from '../../utils/logger.js';

import type { AIWorkerPool, AIWorkerResult, Tool } from '../../workers/types.js';

const log = createLogger('GenerateStructured');

const DEFAULT_ATTEMPTS = 2;

/** Caller-supplied gate. Returning an error message drives the repair turn. */
export type StructuredValidation<T> = { ok: true; value: T } | { ok: false; error: string };

export interface GenerateStructuredOptions<T> {
  aiWorkerPool: AIWorkerPool;
  req?: unknown;
  /** Worker request type, e.g. 'doc_generation' — drives model routing. */
  type: string;
  systemPrompt: string;
  userContent: string;
  toolName: string;
  toolDescription: string;
  /**
   * JSON Schema shown to the MODEL. Keep it loose (few required fields, no deep
   * anyOf): strict provider schema modes reject `default`, and gpt-oss/mistral
   * handle deeply nested unions poorly. The strictness lives in `validate`.
   */
  schema: Record<string, unknown>;
  validate: (input: unknown) => StructuredValidation<T>;
  /** Last resort when a provider ignores tools and replies with text. */
  parseText?: (text: string) => T | null;
  attempts?: number;
  temperature?: number;
  /** Log prefix, e.g. 'pdf'. */
  label: string;
}

export type GenerateStructuredResult<T> = { ok: true; data: T } | { ok: false; error: string };

function extractToolInput(
  result: AIWorkerResult,
  toolName: string
): Record<string, unknown> | null {
  if (result.tool_calls) {
    const match = result.tool_calls.find((c) => c.name === toolName);
    if (match) return match.input;
  }
  if (result.raw_content_blocks) {
    for (const block of result.raw_content_blocks) {
      if (block.type === 'tool_use' && block.name === toolName && block.input) return block.input;
    }
  }
  return null;
}

export async function generateStructured<T>(
  opts: GenerateStructuredOptions<T>
): Promise<GenerateStructuredResult<T>> {
  const {
    aiWorkerPool,
    req,
    type,
    systemPrompt,
    userContent,
    toolName,
    toolDescription,
    schema,
    validate,
    parseText,
    label,
  } = opts;
  const attempts = opts.attempts ?? DEFAULT_ATTEMPTS;

  // The AI SDK's asSchema helper rejects raw JSON-Schema objects — wrap first
  // (same as runSharepicEdit / runCanvasSuggest).
  const tool: Tool = {
    name: toolName,
    description: toolDescription,
    input_schema: jsonSchema(
      schema as Parameters<typeof jsonSchema>[0]
    ) as unknown as Tool['input_schema'],
  };

  let lastError = '';
  let lastRaw = '';

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const isRepair = attempt > 1 && lastRaw !== '';
    const messages = isRepair
      ? [
          { role: 'user', content: userContent },
          { role: 'assistant', content: lastRaw },
          {
            role: 'user',
            content:
              `Deine Ausgabe war ungültig: ${lastError}\n\n` +
              `Gib sie korrigiert und VOLLSTÄNDIG erneut über das Tool ${toolName} aus. ` +
              'Lass kein Pflichtfeld weg und kürze den Inhalt nicht.',
          },
        ]
      : [{ role: 'user', content: userContent }];

    try {
      const result = await aiWorkerPool.processRequest(
        {
          type,
          systemPrompt,
          messages,
          options: {
            tools: [tool],
            tool_choice: 'required',
            // A repair runs deterministically — creativity already failed once.
            temperature: isRepair ? 0 : (opts.temperature ?? 0.4),
          },
        },
        req as Parameters<AIWorkerPool['processRequest']>[1]
      );

      if (!result.success) {
        lastError = result.error || 'AI request failed';
        log.warn(`[${label}] attempt ${attempt} provider error: ${lastError}`);
        continue;
      }

      const toolInput = extractToolInput(result, toolName);
      if (toolInput) {
        const validated = validate(toolInput);
        if (validated.ok) return { ok: true, data: validated.value };
        lastError = validated.error;
        lastRaw = JSON.stringify(toolInput);
        log.warn(
          `[${label}] attempt ${attempt} rejected: ${lastError}\n  raw: ${lastRaw.slice(0, 600)}`
        );
        continue;
      }

      // No tool call. Providers that ignore tools still answer with text, and
      // that text used to be the ONLY path — try it before failing the attempt.
      if (parseText && result.content) {
        const fromText = parseText(result.content);
        if (fromText) {
          log.info(`[${label}] attempt ${attempt}: no tool call, recovered from text`);
          return { ok: true, data: fromText };
        }
      }
      lastError = 'Kein Tool-Aufruf in der Antwort';
      lastRaw = (result.content ?? '').slice(0, 2000);
      log.warn(
        `[${label}] attempt ${attempt}: no tool call (stop_reason=${result.stop_reason ?? 'unknown'})`
      );
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      log.error(`[${label}] attempt ${attempt} threw: ${lastError}`);
    }
  }

  return { ok: false, error: lastError || 'unbekannter Fehler' };
}
