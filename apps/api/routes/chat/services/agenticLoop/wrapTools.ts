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
import { recordDecision } from '../../../../utils/decisionJournal.js';
import { createLogger } from '../../../../utils/logger.js';

import { truncateResultForModel } from './truncate.js';
import { readMcpResult, type PersistedStep } from './types.js';

import type { ToolLoopGuards } from './loopGuards.js';
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
  /** Per-tool overrides for tools whose honest runtime exceeds the generic
   *  budget — see TOOL_TIMEOUT_OVERRIDES_MS. */
  perCallTimeoutOverridesMs?: Record<string, number>;
  /** Internal structured tools exempt from the near-duplicate heuristic
   *  (same reasoning as the `serverNameFor`-based MCP skip) — see
   *  NEAR_DUPLICATE_EXEMPT_TOOLS. */
  nearDuplicateExemptTools?: ReadonlySet<string>;
  /** Optional display title for the tool card (else the tool name is shown). */
  titleFor?: (toolName: string) => string | undefined;
  /** Optional MCP/connector server label for the tool card. */
  serverNameFor?: (toolName: string) => string | undefined;
  /** Character index into the final answer text at the moment a tool call
   *  STARTS — persisted as `PersistedStep.textOffset` so thread reload can
   *  interleave text segments and tool cards in the live order. Returns `null`
   *  when offsets must NOT be recorded (split mode: text stays empty during
   *  gather, so every offset would be a meaningless 0). */
  getTextOffset?: () => number | null;
  /** Drains the planner narration buffered since the previous tool call and
   *  returns it (or `null` if none). Called once at each tool START, so the
   *  announcement sentence(s) are associated with the tool they preceded.
   *  Split mode only; unified mode narration flows through the answer text. */
  takeNarration?: () => string | null;
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

/** For a connector (MCP) tool, describe what its result ACTUALLY carried — a
 *  bare "ok" hid whether the service returned data or an empty string, which is
 *  the single fact needed to tell "no entries" apart from a broken relay/synth
 *  when a later answer claims "kein Zugriff / keine Einträge". */
function describeMcpContent(output: unknown): string {
  const view = readMcpResult(asRecord(output));
  if (!view.ok) return 'Fehler';
  if (view.content.trim() === '') return 'LEER (0 Zeichen zurückgegeben)';
  const preview = view.content.slice(0, 140).replace(/\s+/g, ' ');
  return `${view.content.length} Zeichen: "${preview}${view.content.length > 140 ? '…' : ''}"`;
}

class ToolTimeoutError extends Error {
  constructor(ms: number) {
    super(`Zeitüberschreitung nach ${ms}ms`);
    this.name = 'ToolTimeoutError';
  }
}

/**
 * Hand-rolled on purpose — do NOT replace this with the AI SDK's
 * `timeout: { toolMs }` (checked against ai@7.0.37, `dist/index.js` ~:2918).
 *
 * `toolMs` is COOPERATIVE, not enforcing: the SDK turns it into
 * `AbortSignal.timeout(ms)`, merges it into the tool's `options.abortSignal`
 * and then plainly awaits the tool. There is no timer racing the await. A tool
 * that never reads the signal runs unbounded.
 *
 * Not one of our tools reads it — none of the `execute` implementations in
 * `agents/searchTools.ts` / `domainTools.ts` / the other catalogs even declares
 * the second `options` parameter. Switching would therefore be a silent no-op
 * that removes the only hard bound on a hung tool call.
 *
 * The enforcement also has to live INSIDE this wrapper, not around it: the
 * rejection is caught below and turned into `{ error }`, which is what makes a
 * timeout count as a tool failure (`noteFailure` → MAX_FAILURES_PER_TOOL),
 * persist via `recordStep`, and close the tool card via `sendResult`. An
 * abort from outside would skip all three and leave the card spinning.
 *
 * `onTimeout` is what makes the abandonment visible to the tool — see the
 * `abandoned` controller at the call site.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new ToolTimeoutError(ms));
    }, ms);
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

type ExecuteFn = (
  input: unknown,
  options: { toolCallId: string; abortSignal?: AbortSignal }
) => Promise<unknown>;

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

    const sendStart = (
      stepId: string,
      args: Record<string, unknown>,
      narration?: string | null
    ): void => {
      ctx.sse.send('tool_step_start', {
        stepId,
        toolName,
        args,
        ...(title ? { title } : {}),
        ...(serverName ? { serverName } : {}),
        ...(narration ? { narration } : {}),
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

      // Guard order is load-bearing. Concurrency runs FIRST because it is a
      // DEFERRAL — this very call is expected back in a later step, so it must
      // leave no trace that would then block it, while `checkDuplicate` at the
      // end of the chain registers the call key on its way through.
      //
      // checkDuplicate is in fact the only guard that mutates state. If an
      // earlier one trips it isn't called, so a blocked call doesn't register —
      // harmless: failure/total caps stay tripped for the turn and maxSteps
      // bounds any spin.
      const block =
        ctx.guards.checkSearchConcurrency(toolName) ??
        ctx.guards.checkFailureCap(toolName) ??
        ctx.guards.checkTotalFailureBudget() ??
        ctx.guards.checkSearchBudget(toolName) ??
        // Connector tools (server != null) and internal structured tools
        // (NEAR_DUPLICATE_EXEMPT_TOOLS) skip the search-tuned near-dup
        // heuristic: structured args collide falsely and corrective retries
        // after a validation error would be wrongly blocked as "too similar".
        ctx.guards.checkDuplicate(toolName, input, {
          skipNearDuplicate: !!server || (ctx.nearDuplicateExemptTools?.has(toolName) ?? false),
        });
      if (block) {
        // No `sendStart`/`sendResult`/`recordStep`, for ANY guard: the tool did
        // not run, so a card claiming it did — captioned with steering text
        // meant for the planner ("Formuliere eine WIRKLICH ANDERE Suche …") — is
        // a false statement about the turn. It also skips `noteCall`, so a blocked
        // call costs neither a search-budget slot nor a failure. The narration
        // buffer stays undrained on purpose: the announcement belongs to
        // whichever call actually runs next.
        const verb = block.kind === 'defer' ? 'zurückgestellt' : 'blockiert';
        log.info(`[Tool] ${toolName} ${verb} (${block.guard}) — ${block.modelMessage}`);
        recordDecision('loop.tool_guard', block.guard, {
          because: block.kind,
          inputs: { toolName },
        });
        return { error: block.modelMessage };
      }

      // Captured at tool START (before execution) — the semantics of textOffset.
      const textOffset = ctx.getTextOffset?.();
      // Drained once at START: the planner sentence(s) that announced this call.
      // Parallel siblings in one model step share the announcement, so only the
      // first sendStart gets it — the rest drain empty. Split mode only.
      const narration = ctx.takeNarration?.() ?? null;

      ctx.guards.noteCall(toolName);
      sendStart(stepId, args, narration);

      let output: unknown;
      // A timed-out call is ABANDONED, not cancelled: `withTimeout` stops
      // waiting, the tool itself runs on. For a retrieval tool that is merely
      // wasteful; for a GENERATION tool it produces a second reality. Live on
      // 02.08.2026 a `create_pdf` written off after 20s finished 45s later, wrote
      // its document and pushed a `document_created` card into a turn whose model
      // had been told twice that the call failed — and whose answer then claimed
      // success it could not know about. This signal is how a tool can tell; the
      // generation tools check it immediately before they commit anything.
      const abandoned = new AbortController();
      try {
        const timeoutMs = ctx.perCallTimeoutOverridesMs?.[toolName] ?? ctx.perCallTimeoutMs;
        output = await withTimeout(
          Promise.resolve(original(input, { ...options, abortSignal: abandoned.signal })),
          timeoutMs,
          () => abandoned.abort()
        );
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
        // Connector tools log their real content size + preview (not just "ok"),
        // so an empty-but-successful call is unmistakable in the backend.
        const detail = server ? describeMcpContent(output) : outcomeDetail;
        log.info(`[Tool] ${toolName}${serverTag} ok — ${detail}`);
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
        ...(textOffset != null && { textOffset }),
        ...(narration ? { narration } : {}),
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
