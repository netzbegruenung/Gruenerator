/**
 * Wraps an AI-SDK ToolSet with the cross-cutting concerns every agentic-loop
 * tool needs, so individual tool definitions stay focused on their own logic:
 *
 *   - guard checks (per-tool failure cap, total-failure budget, duplicate call)
 *     BEFORE execution — a guarded call returns an `{ error }` result the model
 *     sees and self-corrects on, instead of executing;
 *   - `tool_step_start` / `tool_step_result` SSE so the UI renders a real tool
 *     card per call (replacing the intent-fabricated card);
 *   - error containment: a thrown/timed-out tool becomes an `{ error }` result
 *     fed back to the model (OpenWebUI's self-correction rule) — the loop never
 *     dies on a single tool failure;
 *   - a per-call timeout;
 *   - a safety-net truncation of the model-facing payload so a huge tool result
 *     (e.g. an MCP blob in Phase 2) can't blow the context window; and
 *   - step recording for persistence.
 *
 * The wrapper never changes a tool's `inputSchema`/`description`; it only
 * decorates `execute`.
 */
import { createLogger } from '../../../../utils/logger.js';

import { truncateResultForModel } from './truncate.js';

import type { ToolLoopGuards } from './loopGuards.js';
import type { PersistedStep } from './types.js';
import type { SSEWriter } from '../sseHelpers.js';
import type { ToolSet } from 'ai';

const log = createLogger('agenticTools');

export interface WrapToolsContext {
  sse: SSEWriter;
  guards: ToolLoopGuards;
  /** Called once per executed (or guard-blocked) tool call, in order. */
  recordStep: (step: PersistedStep) => void;
  /** Per tool-call execution timeout (ms). */
  perCallTimeoutMs: number;
  /** Optional display title for the tool card (else the tool name is shown). */
  titleFor?: (toolName: string) => string | undefined;
  /** Optional MCP/connector server label for the tool card. */
  serverNameFor?: (toolName: string) => string | undefined;
  /** Safety-net cap on the serialized model-facing result. Default 6000. */
  maxResultChars?: number;
}

function isErrorResult(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    (value as { error?: unknown }).error != null
  );
}

/** One-line German summary for the tool card. */
function summarize(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const r = result as Record<string, unknown>;
  if (typeof r.error === 'string') return r.error;
  if (Array.isArray(r.results)) return `${r.results.length} Ergebnisse`;
  if (typeof r.resultCount === 'number') return `${r.resultCount} Ergebnisse`;
  if (Array.isArray(r.examples)) return `${r.examples.length} Beispiele`;
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : { value };
}

class ToolTimeoutError extends Error {
  constructor(ms: number) {
    super(`Zeitüberschreitung nach ${ms}ms`);
    this.name = 'ToolTimeoutError';
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ToolTimeoutError(ms)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    );
  });
}

type ExecuteFn = (input: unknown, options: { toolCallId: string }) => Promise<unknown>;

export function wrapToolsForLoop(tools: ToolSet, ctx: WrapToolsContext): ToolSet {
  const maxResultChars = ctx.maxResultChars ?? 6000;
  const wrapped: ToolSet = {};

  for (const [toolName, toolDef] of Object.entries(tools)) {
    const original = (toolDef as { execute?: ExecuteFn }).execute;
    if (typeof original !== 'function') {
      wrapped[toolName] = toolDef;
      continue;
    }

    const title = ctx.titleFor?.(toolName);
    const serverName = ctx.serverNameFor?.(toolName);

    const sendStart = (stepId: string, args: Record<string, unknown>): void => {
      ctx.sse.send('tool_step_start', {
        stepId,
        toolName,
        args,
        ...(title ? { title } : {}),
        ...(serverName ? { serverName } : {}),
      });
    };
    const sendResult = (stepId: string, ok: boolean, result: unknown): void => {
      const summary = summarize(result);
      ctx.sse.send('tool_step_result', {
        stepId,
        toolName,
        ok,
        ...(summary ? { summary } : {}),
        result: asRecord(result),
      });
    };

    const wrappedExecute: ExecuteFn = async (input, options) => {
      const stepId = options.toolCallId;
      const args = asRecord(input);
      // MCP connector server title (undefined for internal tools) — persisted so
      // a later turn can identify + replay which server this call hit.
      const server = ctx.serverNameFor?.(toolName);
      const serverMeta = server ? { serverName: server } : {};

      // checkDuplicate is the only guard that mutates state (registers the
      // call key). If an earlier guard trips it isn't called, so a blocked
      // call doesn't register — harmless: failure/total caps stay tripped for
      // the turn and maxSteps bounds any spin.
      const guardError =
        ctx.guards.checkFailureCap(toolName) ??
        ctx.guards.checkTotalFailureBudget() ??
        ctx.guards.checkSearchBudget(toolName) ??
        ctx.guards.checkInternalFirst(toolName) ??
        ctx.guards.checkDuplicate(toolName, input);
      if (guardError) {
        const result = { error: guardError };
        sendStart(stepId, args);
        sendResult(stepId, false, result);
        ctx.recordStep({ toolCallId: stepId, toolName, args, result, ...serverMeta });
        return result;
      }

      ctx.guards.noteCall(toolName);
      sendStart(stepId, args);

      let output: unknown;
      try {
        output = await withTimeout(Promise.resolve(original(input, options)), ctx.perCallTimeoutMs);
      } catch (err) {
        output = { error: err instanceof Error ? err.message : String(err) };
      }

      ctx.guards.noteCompletion(toolName);
      const ok = !isErrorResult(output);
      if (!ok) ctx.guards.noteFailure(toolName);

      // Per-tool backend visibility: every tool outcome (internal OR MCP) is
      // now logged, so a failing connector call (e.g. Tally "no workspace")
      // shows up in the server logs instead of vanishing into the single
      // end-of-turn `steps=N` line. Failures log at WARN with the error text.
      const outcomeDetail = summarize(output) ?? (ok ? 'ok' : 'Fehler');
      const serverTag = server ? ` server="${server}"` : '';
      if (ok) {
        log.info(`[Tool] ${toolName}${serverTag} ok — ${outcomeDetail}`);
      } else {
        log.warn(`[Tool] ${toolName}${serverTag} FEHLER — ${outcomeDetail}`);
        // MCP/connector failures also get a first-class, user-facing error
        // event (the generic tool card only carries ok:false); internal tools
        // keep their own error channels.
        if (server) {
          ctx.sse.send('mcp_tool_error', {
            toolName,
            serverName: server,
            error: outcomeDetail,
          });
        }
      }

      ctx.recordStep({
        toolCallId: stepId,
        toolName,
        args,
        result: asRecord(output),
        ...serverMeta,
      });
      sendResult(stepId, ok, output);

      // Model-facing payload only — the full result already went to the card /
      // persisted step above.
      return truncateResultForModel(output, maxResultChars);
    };

    wrapped[toolName] = { ...toolDef, execute: wrappedExecute } as ToolSet[string];
  }

  return wrapped;
}
