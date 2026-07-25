'use client';

import { useMemo, useState, type ComponentProps } from 'react';
import { ChevronDown } from 'lucide-react';
import { MessagePrimitive, useAuiState } from '@assistant-ui/react';
import { useShallow } from 'zustand/shallow';
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
const NAME_SEPARATOR = '\u001f';

/**
 * Collapses a contiguous run of ≥2 tool-call cards (same `parentId`, per
 * ChatGraph run-grouping) into a single "4 Suchen, 1 Sharepic" summary row
 * once the message has finished streaming. Passthrough (cards render
 * individually, unchanged) while streaming, for single-card runs, and for
 * pre-rollout messages that carry no `parentId`.
 *
 * Wired as `MessagePrimitive.Parts`' `components.ToolGroup` — assistant-ui
 * already segments consecutive tool-call parts into these ranges (a text
 * part in between starts a new range), so `startIndex`/`endIndex` already
 * match one narration run 1:1; `children` is the already-rendered card
 * stack (`ToolCallUI` via the shared toolkit), untouched.
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

  const canCollapse = !isStreaming && sameParentRun;

  const summary = useMemo(() => {
    if (!canCollapse) return '';
    const counts = new Map<string, number>();
    for (const name of toolNamesKey.split(NAME_SEPARATOR)) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => toolCountLabel(name, count))
      .join(', ');
  }, [canCollapse, toolNamesKey]);

  if (!canCollapse) return <>{children}</>;

  return (
    <div className="my-1.5 text-sm">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-primary/5 px-2.5 py-1 transition-colors hover:bg-primary/10"
      >
        <span className="font-medium text-foreground">{summary}</span>
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
