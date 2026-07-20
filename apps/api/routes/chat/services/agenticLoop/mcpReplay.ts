/**
 * Structured cross-turn replay of tool usage.
 *
 * The agentic loop rebuilds its model history from client-sent messages as
 * role+text only, so on a later turn the model has no memory of which tool it
 * ran or what it returned. This reconstructs prior tool interactions as real
 * AI-SDK tool-call/tool-result messages (the OpenWebUI/LobeHub pattern) and
 * feeds them back, so a follow-up like "mach das nochmal" or "trag das jetzt
 * ein" sees the earlier calls.
 *
 * Generalised beyond MCP: it replays ANY step the caller passes (search,
 * bundestag, umfragen, summarize, personal-data, MCP, system sources). The
 * caller decides WHICH steps are replayable observations (excluding side-
 * effecting/generative actions); this function only enforces the VALIDITY GATE:
 * a tool-call for a tool not mounted this turn would be rejected by the provider,
 * so steps whose name is not in the current catalog are skipped.
 *
 * A `PersistedStep` bundles a call AND its result atomically (wrapTools records
 * after execution), so — unlike OpenWebUI's separate call/result items — orphans
 * are impossible here; every replayed call has its result.
 */
import { type PersistedStep } from './types.js';

import type { ModelMessage } from 'ai';

const DEFAULT_MAX_STEPS = 6;
const RESULT_PREVIEW_CHARS = 500;

function shortValue(result: Record<string, unknown>): string {
  let s: string;
  try {
    s = JSON.stringify(result);
  } catch {
    return '[nicht serialisierbar]';
  }
  if (!s) return '';
  return s.length > RESULT_PREVIEW_CHARS ? `${s.slice(0, RESULT_PREVIEW_CHARS)}…` : s;
}

/**
 * Reconstruct `[assistant{tool-call…}, tool{tool-result…}]` from prior tool steps.
 *
 * @param steps            recent persisted steps (already filtered by the caller
 *                         to replayable observations), oldest → newest
 * @param currentCatalogNames tool names mounted THIS turn (validity gate)
 * @returns a 2-message block, or `[]` when no valid step remains
 */
export function buildToolObservationReplay(
  steps: readonly PersistedStep[],
  currentCatalogNames: ReadonlySet<string>,
  opts?: { maxSteps?: number }
): ModelMessage[] {
  const maxSteps = opts?.maxSteps ?? DEFAULT_MAX_STEPS;
  const seen = new Set<string>();
  const valid = steps.filter((s) => {
    if (!currentCatalogNames.has(s.toolName)) return false; // validity gate
    if (seen.has(s.toolCallId)) return false; // dedup by call id
    seen.add(s.toolCallId);
    return true;
  });
  const kept = valid.slice(-maxSteps); // most-recent N
  if (kept.length === 0) return [];

  const assistant: ModelMessage = {
    role: 'assistant',
    content: kept.map((s) => ({
      type: 'tool-call' as const,
      toolCallId: s.toolCallId,
      toolName: s.toolName,
      input: s.args,
    })),
  };
  const tool: ModelMessage = {
    role: 'tool',
    content: kept.map((s) => ({
      type: 'tool-result' as const,
      toolCallId: s.toolCallId,
      toolName: s.toolName,
      output: { type: 'text' as const, value: shortValue(s.result) },
    })),
  };
  return [assistant, tool];
}
