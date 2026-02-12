'use client';

import { useEffect, useRef } from 'react';
import { agentsList, type AgentListItem } from '../../lib/agents';

interface MentionPopoverProps {
  query: string;
  visible: boolean;
  onSelect: (agent: AgentListItem) => void;
  onDismiss: () => void;
  selectedIndex: number;
  anchorRect: { x: number; y: number } | null;
}

function filterAgents(query: string): AgentListItem[] {
  if (!query) return agentsList;
  const q = query.toLowerCase();
  return agentsList.filter(
    (a) =>
      a.mention.toLowerCase().includes(q) ||
      a.title.toLowerCase().includes(q) ||
      a.identifier.toLowerCase().includes(q)
  );
}

export function MentionPopover({
  query,
  visible,
  onSelect,
  onDismiss,
  selectedIndex,
  anchorRect,
}: MentionPopoverProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const filtered = filterAgents(query);

  useEffect(() => {
    if (!visible) return;
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, visible]);

  if (!visible || filtered.length === 0 || !anchorRect) return null;

  return (
    <div
      ref={listRef}
      role="listbox"
      className="mention-popover absolute z-50 max-h-60 w-64 overflow-y-auto rounded-xl border border-border bg-background shadow-lg"
      style={{
        bottom: '100%',
        left: 0,
        marginBottom: '0.5rem',
      }}
    >
      {filtered.map((agent, i) => (
        <button
          key={agent.identifier}
          role="option"
          aria-selected={i === selectedIndex}
          className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
            i === selectedIndex
              ? 'bg-primary/10 text-foreground'
              : 'text-foreground-muted hover:bg-primary/5'
          }`}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(agent);
          }}
        >
          <span
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-sm"
            style={{ backgroundColor: agent.backgroundColor }}
          >
            {agent.avatar}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{agent.title}</p>
            <p className="truncate text-xs text-foreground-muted">@{agent.mention}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

export { filterAgents };
