'use client';

import { useAuiState } from '@assistant-ui/react';
import { useShallow } from 'zustand/shallow';
import { selectNarration, type PartLike } from '../../lib/narrationView';

/**
 * Renders the planner announcement sentence(s) persisted on a tool-call part as
 * muted text above its card (ChatGPT-style between-tool prose). Reads the raw
 * part via `useAuiState` — assistant-ui's typed tool-render props don't carry
 * the custom `narration` field, but it survives on `message.parts` (same channel
 * `ToolCallGroup` uses for `parentId`), both live and on reload. The selection
 * rule is unit-tested in narrationView.vitest.ts.
 */
export function ToolNarration({ toolCallId }: { toolCallId: string }) {
  const narration = useAuiState(
    useShallow((s) => selectNarration((s.message?.parts ?? []) as ReadonlyArray<PartLike>, toolCallId))
  );

  if (!narration) return null;
  return <p className="tool-narration">{narration}</p>;
}
