'use client';

import { useEffect, useRef } from 'react';
import { filterMentionables, type Mentionable } from '../../lib/mentionables';

interface MentionPopoverProps {
  query: string;
  visible: boolean;
  onSelect: (mentionable: Mentionable) => void;
  onDismiss: () => void;
  selectedIndex: number;
  anchorRect: { x: number; y: number } | null;
}

function getFilteredItems(query: string): Mentionable[] {
  const { notebooks, tools, documents } = filterMentionables(query);
  return [...tools, ...documents, ...notebooks];
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
  const { notebooks, tools, documents } = filterMentionables(query);
  const allItems = [...tools, ...documents, ...notebooks];

  useEffect(() => {
    if (!visible) return;
    const el = listRef.current?.querySelector('[data-selected="true"]') as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, visible]);

  if (!visible || allItems.length === 0 || !anchorRect) return null;

  let itemIndex = 0;

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
      {tools.length > 0 && (
        <>
          <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-foreground-muted/60">
            Werkzeuge
          </div>
          {tools.map((tool) => {
            const idx = itemIndex++;
            return (
              <MentionItem
                key={tool.identifier}
                mentionable={tool}
                isSelected={idx === selectedIndex}
                onSelect={onSelect}
              />
            );
          })}
        </>
      )}
      {documents.length > 0 && (
        <>
          <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-foreground-muted/60">
            Dateien
          </div>
          {documents.map((doc) => {
            const idx = itemIndex++;
            return (
              <MentionItem
                key={doc.identifier}
                mentionable={doc}
                isSelected={idx === selectedIndex}
                onSelect={onSelect}
              />
            );
          })}
        </>
      )}
      {notebooks.length > 0 && (
        <>
          <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-foreground-muted/60">
            Notizbücher
          </div>
          {notebooks.map((notebook) => {
            const idx = itemIndex++;
            return (
              <MentionItem
                key={notebook.identifier}
                mentionable={notebook}
                isSelected={idx === selectedIndex}
                onSelect={onSelect}
              />
            );
          })}
        </>
      )}
    </div>
  );
}

function MentionItem({
  mentionable,
  isSelected,
  onSelect,
}: {
  mentionable: Mentionable;
  isSelected: boolean;
  onSelect: (m: Mentionable) => void;
}) {
  return (
    <button
      role="option"
      aria-selected={isSelected}
      data-selected={isSelected}
      className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
        isSelected ? 'bg-primary/10 text-foreground' : 'text-foreground-muted hover:bg-primary/5'
      }`}
      onMouseDown={(e) => {
        e.preventDefault();
        onSelect(mentionable);
      }}
    >
      <span
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-sm"
        style={{ backgroundColor: mentionable.backgroundColor }}
      >
        {mentionable.avatar}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{mentionable.title}</p>
        <p className="truncate text-xs text-foreground-muted">
          {mentionable.trigger}
          {mentionable.mention}
        </p>
      </div>
    </button>
  );
}

export { getFilteredItems as filterMentionables };
