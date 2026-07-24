'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAuiState } from '@assistant-ui/react';
import { useShallow } from 'zustand/shallow';
import { toolCountLabel } from '../../lib/toolMappings';

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
export function ToolCallGroup({
  startIndex,
  endIndex,
  children,
}: {
  startIndex: number;
  endIndex: number;
  children?: ReactNode;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { toolNames, parentIds, isStreaming } = useAuiState(
    useShallow((s) => {
      const parts = s.message?.parts ?? [];
      const slice = parts.slice(startIndex, endIndex + 1) as ReadonlyArray<{
        type: string;
        toolName?: string;
        parentId?: string;
      }>;
      const toolParts = slice.filter((p) => p.type === 'tool-call');
      const lastIndex = parts.length - 1;
      const running =
        s.message?.status?.type === 'running' && lastIndex >= startIndex && lastIndex <= endIndex;
      return {
        toolNames: toolParts.map((p) => p.toolName ?? 'unknown'),
        parentIds: toolParts.map((p) => p.parentId),
        isStreaming: running,
      };
    })
  );

  const firstParentId = parentIds[0];
  const canCollapse =
    !isStreaming &&
    toolNames.length >= 2 &&
    firstParentId != null &&
    parentIds.every((id) => id === firstParentId);

  const summary = useMemo(() => {
    if (!canCollapse) return '';
    const counts = new Map<string, number>();
    for (const name of toolNames) counts.set(name, (counts.get(name) ?? 0) + 1);
    return Array.from(counts.entries())
      .map(([name, count]) => toolCountLabel(name, count))
      .join(', ');
  }, [canCollapse, toolNames]);

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
}
