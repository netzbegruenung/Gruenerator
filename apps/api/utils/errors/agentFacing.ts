/**
 * Agent-facing errors — one object, two audiences.
 *
 * Every failure in the chat stack carries BOTH the human-facing German copy
 * (`userMessage`, for the SSE `warning`/`error` event) and a model-facing hint
 * (`modelHint`, fed back to the LLM) that names the concrete violation and the
 * expected structure. The model can then correct itself instead of the code
 * silently coercing a wrong value — the failure mode that produced an invalid
 * `document_subtype` reaching the DB check constraint.
 *
 * Deliberately free of SSE/Express imports so it can be used from both
 * `agents/langgraph` (graph nodes) and `routes/chat` (emitters).
 */

import { type ZodError } from 'zod';

import { withRetry } from '../../services/search/searchRetryStrategy.js';
import { createLogger } from '../logger.js';

const log = createLogger('AgentFacingError');

/**
 * A failure that is communicable to both the user and the model.
 *
 * `code` is monitoring vocabulary (a `ChatWarningCode`/`ChatErrorCode`), never
 * shown verbatim to the user.
 */
export interface AgentFacingError {
  code: string;
  /** German, user-facing. Only rendered when no model is left to explain it. */
  userMessage: string;
  /** What was wrong + what would be right. Fed back to the LLM. */
  modelHint: string;
  retryable: boolean;
  /** Valid values, when the violation was an out-of-enum one. */
  expected?: string[];
}

/**
 * Build a model-facing hint for an out-of-enum value.
 *
 * Example: `makeInvalidEnumHint('subtype', 'brief', DOC_SUBTYPES)` →
 * `invalid subtype "brief" — valid values: antrag, pressemitteilung, …`
 */
export function makeInvalidEnumHint(
  field: string,
  got: unknown,
  allowed: readonly string[]
): string {
  return `invalid ${field} ${JSON.stringify(String(got))} — valid values: ${allowed.join(', ')}`;
}

/**
 * Build a model-facing hint for an unparseable structured response.
 */
export function makeInvalidShapeHint(expectedShape: string, detail?: string): string {
  const suffix = detail ? ` (${detail})` : '';
  return `response could not be parsed${suffix} — respond with exactly this JSON shape: ${expectedShape}`;
}

/**
 * Flatten Zod issues into a model-readable list.
 * Mirrors `formatZodError` from middleware/validateBody.ts, which now imports
 * this so request validation and model repair share one formatter.
 */
export function formatZodIssuesForModel(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');
}

/**
 * Canonical shape for a failed tool result inside the agentic loop.
 *
 * `wrapTools.isErrorResult` flags any result carrying an `error` key, so this
 * renders as a failed tool card AND reaches the model verbatim — which is the
 * point: the model sees `expected` and can retry the call correctly.
 */
export interface ToolErrorResult {
  error: true;
  message: string;
  expected?: string[];
}

export function toolErrorResult(message: string, expected?: string[]): ToolErrorResult {
  return expected && expected.length > 0
    ? { error: true, message, expected }
    : { error: true, message };
}

/** Result of a parse attempt: either the value, or a hint telling the model how to fix it. */
export type ParseOutcome<T> = { ok: true; value: T } | { ok: false; hint: string };

export interface RepairRetryOptions<TRaw, T> {
  /**
   * Invoke the LLM. On the repair attempt, `repairHint` names the violation
   * and the expected structure — append it as a corrective user message.
   */
  invoke: (repairHint?: string) => Promise<TRaw>;
  /** Validate the raw response. A failure must return a hint, not throw. */
  parse: (raw: TRaw) => ParseOutcome<T>;
  label: string;
}

/**
 * Run an LLM call with two distinct retry policies:
 *
 * - **Validation failure** (parse returned `ok: false`) → ONE repair attempt
 *   with the hint appended, so the model can correct its own output.
 * - **Transient invoke failure** (throw) → ONE plain retry via `withRetry`.
 *
 * Never silently coerces. If both attempts fail the caller decides how to
 * surface it (warning + turn ownership, or a `toolErrorResult` for the loop).
 */
export async function withRepairRetry<TRaw, T>(
  options: RepairRetryOptions<TRaw, T>
): Promise<ParseOutcome<T>> {
  const { invoke, parse, label } = options;

  const invokeOnce = (repairHint?: string): Promise<TRaw> =>
    withRetry(() => invoke(repairHint), {
      maxRetries: 1,
      delayMs: 300,
      label: `${label}${repairHint ? ' (repair)' : ''}`,
    });

  let firstOutcome: ParseOutcome<T>;
  try {
    firstOutcome = parse(await invokeOnce());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`[${label}] invocation failed: ${message}`);
    return { ok: false, hint: `invocation failed: ${message}` };
  }

  if (firstOutcome.ok) return firstOutcome;

  log.warn(`[${label}] validation failed, attempting repair: ${firstOutcome.hint}`);

  try {
    const repaired = parse(await invokeOnce(firstOutcome.hint));
    if (repaired.ok) {
      log.info(`[${label}] repair attempt succeeded`);
      return repaired;
    }
    log.warn(`[${label}] repair attempt still invalid: ${repaired.hint}`);
    return repaired;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`[${label}] repair invocation failed: ${message}`);
    return { ok: false, hint: firstOutcome.hint };
  }
}

/**
 * Compose the corrective user message appended on a repair attempt.
 * Kept here so every repair path phrases the instruction identically.
 */
export function buildRepairInstruction(hint: string): string {
  return `Deine vorherige Antwort war ungültig: ${hint}\n\nAntworte erneut und halte dich exakt an das geforderte Format. Gib NUR das korrigierte Ergebnis aus.`;
}
