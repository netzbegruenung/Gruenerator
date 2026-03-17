'use client';

import { useEffect, useRef, useState } from 'react';
import { Library } from 'lucide-react';
import { filterMentionables, type Mentionable } from '../../lib/mentionables';
import { useSkillFavoritesStore } from '../../stores/skillFavoritesStore';
import { SkillLibraryModal } from '../skills/SkillLibraryModal';

interface SkillPopoverProps {
  query: string;
  visible: boolean;
  onSelect: (mentionable: Mentionable) => void;
  onDismiss: () => void;
  selectedIndex: number;
  anchorRect: { x: number; y: number } | null;
}

export function SkillPopover({
  query,
  visible,
  onSelect,
  onDismiss,
  selectedIndex,
  anchorRect,
}: SkillPopoverProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const favorites = useSkillFavoritesStore((s) => s.favorites);
  const { agents, customAgents } = filterMentionables(query);

  const quickAccessAgents = agents.filter(
    (a) => a.isSystemDefault || favorites.includes(a.mention.toLowerCase())
  );
  const allItems = [...quickAccessAgents, ...customAgents];

  useEffect(() => {
    if (!visible) return;
    const el = listRef.current?.querySelector('[data-selected="true"]') as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, visible]);

  if (libraryOpen) {
    return (
      <SkillLibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onSelect={(m) => {
          onSelect(m);
          setLibraryOpen(false);
        }}
      />
    );
  }

  if (!visible || !anchorRect) return null;

  const showEmptyHint = allItems.length === 0 && query.length > 0;

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
      {quickAccessAgents.length > 0 && (
        <>
          <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-foreground-muted/60">
            Skills
          </div>
          {quickAccessAgents.map((agent) => {
            const idx = itemIndex++;
            return (
              <SkillItem
                key={agent.mention}
                mentionable={agent}
                isSelected={idx === selectedIndex}
                onSelect={onSelect}
              />
            );
          })}
        </>
      )}
      {customAgents.length > 0 && (
        <>
          <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-foreground-muted/60">
            Meine Skills
          </div>
          {customAgents.map((agent) => {
            const idx = itemIndex++;
            return (
              <SkillItem
                key={agent.mention}
                mentionable={agent}
                isSelected={idx === selectedIndex}
                onSelect={onSelect}
              />
            );
          })}
        </>
      )}
      {showEmptyHint && (
        <div className="px-3 py-3 text-xs text-foreground-muted">Kein Skill gefunden</div>
      )}
      <button
        className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-xs text-foreground-muted transition-colors hover:bg-primary/5 hover:text-foreground"
        onMouseDown={(e) => {
          e.preventDefault();
          setLibraryOpen(true);
        }}
      >
        <Library className="h-3.5 w-3.5" />
        Alle Skills durchsuchen...
      </button>
    </div>
  );
}

function SkillItem({
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
        <p className="truncate text-xs text-foreground-muted">/{mentionable.mention}</p>
      </div>
    </button>
  );
}

export { getFilteredSkills } from '../../lib/mentionDetection';
