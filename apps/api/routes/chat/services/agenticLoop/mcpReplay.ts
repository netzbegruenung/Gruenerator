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
import { applyContextCap } from '../../../../utils/contextCap.js';

import { type PersistedStep } from './types.js';
import { stripInternalFields } from './wrapTools.js';

import type { ModelMessage } from 'ai';

const DEFAULT_MAX_STEPS = 6;
const RESULT_PREVIEW_CHARS = 500;
/**
 * Search-family results are the thread's research memory, so they get a far
 * larger replay budget than the 500-char preview that suits an action result.
 * A 5-hit block is ~2–3k chars (title + URL + a 320-char snippet each); at 500
 * the follow-up turn saw roughly one and a half sources and the conversation
 * felt amnesiac ("welche Kennzahlen gab es nochmal?" → generic answer).
 * The upstream snippet caps already bound this: ≤10 results × ~700 chars.
 */
const SOURCE_RESULT_CHARS = 4000;

/**
 * A result whose payload is REFERENCE TEXT rather than an action confirmation.
 *
 * `sources` was the only field here, and the omission had the exact symptom the
 * comment above describes. `product_knowledge` answers "was kannst du?" with a
 * `knowledge` block and registers no sources, so on 03.08.2026 its replay was
 * capped at 500 of 3.876 characters — 87 % dropped — and the next turn answered
 * about the product from an eighth of what it had just been told.
 */
function carriesReferenceText(result: Record<string, unknown>): boolean {
  return ['sources', 'knowledge'].some(
    (key) => typeof result[key] === 'string' && (result[key] as string).trim().length > 0
  );
}

// A prior search tool-result embeds its OWN numbered "[1] … [2] …" source block.
// Replayed verbatim into this turn's context, those numbers collide with this
// turn's registry namespace — the synth grounds a claim against turn-1's [N]
// while the chips resolve to turn-2's sources (observed live: SPD/Tempolimit
// claims citing Geschäftsordnung excerpts). Neutralize replayed markers so only
// the current turn owns the [N] namespace.
function stripReplayCitationMarkers(s: string): string {
  return s.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, '');
}

function shortValue(result: Record<string, unknown>): string {
  // The persisted step is deliberately raw (card + debugging) — internal-only
  // fields like `rerankDegraded` are stripped HERE, at replay serialization,
  // not before `recordStep`. See `stripInternalFields`'s doc comment.
  const replayable = stripInternalFields(result);
  let s: string;
  try {
    s = JSON.stringify(replayable);
  } catch {
    return '[nicht serialisierbar]';
  }
  if (!s) return '';
  s = stripReplayCitationMarkers(s);
  const reference = carriesReferenceText(result);
  const cap = reference ? SOURCE_RESULT_CHARS : RESULT_PREVIEW_CHARS;
  return applyContextCap(s, cap, reference ? 'mcpReplay:sources' : 'mcpReplay:result');
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

/**
 * Bridge between a replayed tool result and the current user message.
 *
 * mistral-common — the validator behind GreenPT and the Mistral API — checks
 * role transitions strictly and rejects a `user` message directly after a `tool`
 * message (live 14.08.2026, GreenPT/mistral-small: 400 "Unexpected role 'user'
 * after role 'tool'"). That is exactly the shape the replay produces when it is
 * spliced in front of the current user turn. A one-line assistant message makes
 * the transition legal; hosts that don't validate simply see one short turn more.
 */
export const REPLAY_BRIDGE_TEXT = '(Ergebnisse der bisherigen Tool-Aufrufe siehe oben.)';

/**
 * Splice the replay block in just before the current user message, so every
 * tool-call stays adjacent to its result and the role sequence stays valid.
 */
export function spliceToolReplay(
  messages: readonly ModelMessage[],
  replay: readonly ModelMessage[]
): ModelMessage[] {
  if (replay.length === 0 || messages.length === 0) return [...messages];
  const last = messages[messages.length - 1];
  const bridge: ModelMessage[] =
    last.role === 'user' ? [{ role: 'assistant', content: REPLAY_BRIDGE_TEXT }] : [];
  return [...messages.slice(0, -1), ...replay, ...bridge, last];
}
