import { toolCountLabel } from './toolMappings';

/**
 * Pure view-logic for narration + tool-run grouping, split out from the React
 * components so the rules are unit-testable in the `node` vitest env (the
 * components are thin `useAuiState` wrappers around these functions).
 */

export interface PartLike {
  type: string;
  toolCallId?: string;
  toolName?: string;
  parentId?: string;
  narration?: string;
}

/** Narration persisted on the tool-call part with this id, or null. */
export function selectNarration(parts: ReadonlyArray<PartLike>, toolCallId: string): string | null {
  const part = parts.find((p) => p.type === 'tool-call' && p.toolCallId === toolCallId);
  const narration = part?.narration;
  return typeof narration === 'string' && narration.length > 0 ? narration : null;
}

export type ToolGroupMode =
  | 'passthrough' // render cards inline as-is (single card, or short run)
  | 'live-header' // streaming run of ≥2 cards → shimmer collector header + cards
  | 'collapsed'; // finished long run (≥ threshold) → collapsible summary row

export interface ToolGroupInput {
  toolNames: ReadonlyArray<string>;
  /** Whether these cards form one contiguous run (≥2, same parentId). Computed
   *  by the caller's selector so the store snapshot stays primitives-only (the
   *  React #185 guard in ToolCallGroup). */
  sameParentRun: boolean;
  isStreaming: boolean;
  /** Minimum finished-run size that collapses to a summary row. Default 4. */
  longRunThreshold?: number;
}

export interface ToolGroupView {
  mode: ToolGroupMode;
  /** Summary text for the collapsed row (empty unless mode==='collapsed'). */
  summary: string;
  /** Header label for the live shimmer header (empty unless 'live-header'). */
  headerLabel: string;
}

/** Aggregates tool names into a "4 Suchen, 1 Sharepic" style label. */
function countLabel(toolNames: ReadonlyArray<string>): string {
  const counts = new Map<string, number>();
  for (const name of toolNames) counts.set(name, (counts.get(name) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([name, count]) => toolCountLabel(name, count))
    .join(', ');
}

/**
 * Decides how a contiguous tool-call run renders. Post-#1957 the plan keeps the
 * document-order layout: single cards and short runs stay inline (their
 * narration renders above each card); a run of ≥2 cards gets a live shimmer
 * header while streaming; only genuinely long finished runs collapse into a
 * summary row (expandable to the full transcript, nothing lost).
 */
export function computeToolGroupView(input: ToolGroupInput): ToolGroupView {
  const { toolNames, sameParentRun, isStreaming } = input;
  const threshold = input.longRunThreshold ?? 4;
  const count = toolNames.length;

  if (!sameParentRun) return { mode: 'passthrough', summary: '', headerLabel: '' };

  if (isStreaming) {
    return { mode: 'live-header', summary: '', headerLabel: countLabel(toolNames) };
  }

  if (count >= threshold) {
    return { mode: 'collapsed', summary: countLabel(toolNames), headerLabel: '' };
  }

  return { mode: 'passthrough', summary: '', headerLabel: '' };
}
