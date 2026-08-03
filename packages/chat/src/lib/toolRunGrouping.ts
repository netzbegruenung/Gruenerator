// Contiguous tool-call runs, derived from the message parts.
//
// Web gets the run boundaries handed to it by assistant-ui's `ToolGroup` slot
// (`startIndex`/`endIndex`). `@assistant-ui/react-native` has no such slot, so
// mobile has to find the run itself — which is all this does, so that both
// platforms then feed the SAME `computeToolGroupView` and can't disagree about
// when a run collects under a header or collapses.

import { computeToolGroupView, type PartLike, type ToolGroupView } from './narrationView';
import { visibleToolNames } from './toolStatusLine';

export interface ToolRunView {
  /** This card opens the run, so it is the one that renders the group chrome. */
  isRunStart: boolean;
  /** Stable per-run key (the first card's id) — what expand state is keyed on. */
  runKey: string;
  view: ToolGroupView;
}

/**
 * The run `toolCallId` belongs to, or null if the id isn't among the parts.
 *
 * A run is a maximal stretch of adjacent `tool-call` parts. Retrieval steps stay
 * IN the run (they keep two cards adjacent) but out of the counting — they draw
 * no card, and group chrome describes cards, so counting them would promise
 * "3 Suchen" above a stack that renders two things.
 */
export function selectToolRun(
  parts: ReadonlyArray<PartLike>,
  toolCallId: string,
  isMessageRunning: boolean
): ToolRunView | null {
  const index = parts.findIndex((p) => p.type === 'tool-call' && p.toolCallId === toolCallId);
  if (index < 0) return null;

  let start = index;
  while (start > 0 && parts[start - 1]?.type === 'tool-call') start--;
  let end = index;
  while (end < parts.length - 1 && parts[end + 1]?.type === 'tool-call') end++;

  const run = parts.slice(start, end + 1);
  const firstParentId = run[0]?.parentId;
  const sameParentRun =
    run.length >= 2 && firstParentId != null && run.every((p) => p.parentId === firstParentId);
  const toolNames = visibleToolNames(run.map((p) => p.toolName ?? 'unknown'));

  // Streaming means the run is still the tail of the message — same test web's
  // ToolCallGroup makes. Empty text parts are dropped in conversion, so a
  // running turn genuinely ends on its last card.
  const lastIndex = parts.length - 1;
  const isStreaming = isMessageRunning && lastIndex >= start && lastIndex <= end;

  return {
    isRunStart: index === start,
    runKey: run[0]?.toolCallId ?? toolCallId,
    view: computeToolGroupView({
      toolNames,
      sameParentRun: sameParentRun && toolNames.length >= 2,
      isStreaming,
    }),
  };
}
