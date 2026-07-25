'use client';

import { type MessagePrimitive, useAuiState } from '@assistant-ui/react';
import { ChevronDown } from 'lucide-react';
import { useMemo, useState, type ComponentProps } from 'react';
import { useShallow } from 'zustand/shallow';
import { ShimmerText } from './ShimmerText';
import { computeToolGroupView } from '../../lib/narrationView';
import { toolCountLabel } from '../../lib/toolMappings';

/** Derived from the `MessagePrimitive.Parts` slot so the props can't drift. */
type ToolGroupComponent = NonNullable<
  NonNullable<ComponentProps<typeof MessagePrimitive.Parts>['components']>['ToolGroup']
>;

/**
 * Boundary cast target for message parts: `parentId` is our own run-stamp
 * (threadMessageConversion), not part of assistant-ui's part union.
 */
interface RunStampedPart {
  readonly type: string;
  readonly toolName?: string;
  readonly parentId?: string;
}

const isToolCallPart = (p: RunStampedPart): boolean => p.type === 'tool-call';

/** Separator for the joined tool-name snapshot key; never occurs in tool names. */
const NAME_SEPARATOR = '';

/**
 * Renders a contiguous run of tool-call cards. Post-narration-rollout the
 * default is document-order passthrough (each card shows its persisted
 * narration above it via ToolNarration). Two exceptions, both decided by the
 * unit-tested `computeToolGroupView`:
 *   - while streaming a run of ≥2 cards → a shimmer collector header above the
 *     live cards ("2 Suchen, 1 Sharepic…"), matching ChatGPT's grouped feel;
 *   - a finished LONG run (≥4 cards) → a collapsed summary row, expandable to
 *     the full narration+card transcript (nothing is discarded).
 * Single-tool turns and short finished runs get no group chrome.
 *
 * Wired as `MessagePrimitive.Parts`' `components.ToolGroup`; `children` is the
 * already-rendered card stack (ToolCallUI + ToolNarration), untouched.
 */
export const ToolCallGroup: ToolGroupComponent = ({ startIndex, endIndex, children }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // The selector must return only primitives: `useShallow` compares one level
  // with Object.is, so a freshly built array per call would make every
  // getSnapshot "new" and loop useSyncExternalStore into React #185
  // (maximum update depth) as soon as a message with tool cards renders.
  const { toolNamesKey, sameParentRun, isStreaming } = useAuiState(
    useShallow((s) => {
      const parts = (s.message?.parts ?? []) as ReadonlyArray<RunStampedPart>;
      const toolParts = parts.slice(startIndex, endIndex + 1).filter(isToolCallPart);
      const lastIndex = parts.length - 1;
      const running =
        s.message?.status?.type === 'running' && lastIndex >= startIndex && lastIndex <= endIndex;
      const firstParentId = toolParts[0]?.parentId;
      return {
        toolNamesKey: toolParts.map((p) => p.toolName ?? 'unknown').join(NAME_SEPARATOR),
        sameParentRun:
          toolParts.length >= 2 &&
          firstParentId != null &&
          toolParts.every((p) => p.parentId === firstParentId),
        isStreaming: running,
      };
    })
  );

  const toolNames = useMemo(
    () => (toolNamesKey ? toolNamesKey.split(NAME_SEPARATOR) : []),
    [toolNamesKey]
  );

  const view = useMemo(
    () => computeToolGroupView({ toolNames, sameParentRun, isStreaming }),
    [toolNames, sameParentRun, isStreaming]
  );

  if (view.mode === 'passthrough') return <>{children}</>;

  if (view.mode === 'live-header') {
    // Streaming run: a calm shimmer header sits above the still-visible cards
    // (each with its own narration) — the cards are NOT hidden while running.
    return (
      <div className="my-1.5 text-sm">
        <div className="px-1 py-0.5">
          <ShimmerText className="font-medium">{view.headerLabel}</ShimmerText>
        </div>
        <div className="mt-1 space-y-1">{children}</div>
      </div>
    );
  }

  // Finished long run → collapsed summary row.
  return (
    <div className="my-1.5 text-sm">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-primary/5 px-2.5 py-1 transition-colors hover:bg-primary/10"
      >
        <span className="font-medium text-foreground">{view.summary}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-foreground-muted transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>
      {isExpanded && (
        <div className="mt-1.5 ml-2 space-y-1 border-l-2 border-primary/20 pl-3">{children}</div>
      )}
    </div>
  );
};
