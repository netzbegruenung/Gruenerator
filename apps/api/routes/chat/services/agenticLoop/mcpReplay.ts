/**
 * Structured cross-turn replay of MCP tool usage.
 *
 * The agentic loop rebuilds its model history from client-sent messages as
 * role+text only, so on a later turn the model has no memory of which MCP tool
 * it ran or what it returned. This reconstructs prior MCP tool interactions as
 * real AI-SDK tool-call/tool-result messages (the OpenWebUI/LobeHub pattern) and
 * feeds them back, so a follow-up like "mach das nochmal" sees the earlier call.
 *
 * A `PersistedStep` bundles a call AND its result atomically (wrapTools records
 * after execution), so — unlike OpenWebUI's separate call/result items — orphans
 * are impossible here; every replayed call has its result. The only filter is
 * the VALIDITY GATE: a tool-call for a tool not in this turn's catalog would be
 * rejected by the provider, so steps whose stable name is no longer connected
 * are skipped (correct — the model can't re-invoke a disconnected server anyway).
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
 * Reconstruct `[assistant{tool-call…}, tool{tool-result…}]` from prior MCP steps.
 *
 * @param steps            recent persisted steps, oldest → newest
 * @param currentCatalogNames stable tool names mounted THIS turn (validity gate)
 * @returns a 2-message block, or `[]` when no valid MCP step remains
 */
export function buildMcpReplayMessages(
  steps: readonly PersistedStep[],
  currentCatalogNames: ReadonlySet<string>,
  opts?: { maxSteps?: number }
): ModelMessage[] {
  const maxSteps = opts?.maxSteps ?? DEFAULT_MAX_STEPS;
  const seen = new Set<string>();
  const valid = steps.filter((s) => {
    if (!s.serverName) return false; // MCP steps only (internal tools excluded)
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
