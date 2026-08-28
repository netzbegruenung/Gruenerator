'use client';

import { useEffect, useMemo, useRef } from 'react';

import { mentionableKey, type Mentionable } from '../../lib/mentionables';
import { getFilteredMentionables } from '../../lib/mentionDetection';
import { buildMentionSections, countMentionSectionItems } from '../../lib/mentionSections';
import { phosphorAgentIcon } from '../../lib/phosphorAgentIcon';

import { MentionFloatingPanel } from './MentionFloatingPanel';

interface MentionPopoverProps {
  query: string;
  visible: boolean;
  onSelect: (mentionable: Mentionable) => void;
  onDismiss: () => void;
  selectedIndex: number;
  anchorRect: { x: number; y: number } | null;
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

  // Not memoised on `query` alone: `filterMentionables` reads module-level lists
  // that `mentionableSync` refills asynchronously, and those writes are what a
  // re-render is meant to pick up.
  const sections = buildMentionSections(query);
  const totalItems = countMentionSectionItems(sections);

  useEffect(() => {
    if (!visible) return;
    const el = listRef.current?.querySelector('[data-selected="true"]') as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, visible]);

  const isOpen = visible && totalItems > 0 && !!anchorRect;
  let itemIndex = 0;

  return (
    <MentionFloatingPanel open={isOpen} onDismiss={onDismiss} width="w-64" role="listbox">
      <div ref={listRef} className="overflow-y-auto">
        {sections.map((section) => (
          <div key={section.label}>
            <div className="sticky top-0 z-[1] bg-background px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-foreground-muted/60">
              {section.label}
            </div>
            {section.kind === 'flat'
              ? section.items.map((item) => {
                  const idx = itemIndex++;
                  return (
                    <MentionItem
                      key={mentionableKey(item)}
                      mentionable={item}
                      isSelected={idx === selectedIndex}
                      onSelect={onSelect}
                    />
                  );
                })
              : section.groups.map((group) => (
                  <div key={group.sublabel}>
                    <div className="px-3 pt-1 text-[9px] uppercase tracking-wider text-foreground-muted/50">
                      {group.sublabel}
                    </div>
                    {group.items.map((item) => {
                      const idx = itemIndex++;
                      return (
                        <MentionItem
                          key={mentionableKey(item)}
                          mentionable={item}
                          isSelected={idx === selectedIndex}
                          onSelect={onSelect}
                        />
                      );
                    })}
                  </div>
                ))}
          </div>
        ))}
      </div>
    </MentionFloatingPanel>
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
  // Grünerator-Agenten bringen einen vollen Phosphor-Komponentennamen mit statt
  // einer fertigen Komponente: `mentionables.ts` teilt sich das Mobile-Bündel
  // und darf das Web-Icon-Paket nicht in dessen Graph ziehen. Hier, wo gerendert
  // wird, ist der Auflöser am Platz — lazy und nach Name zwischengespeichert.
  const row = useMemo(
    () =>
      mentionable.type === 'useragent' && mentionable.iconKey && !mentionable.icon
        ? { ...mentionable, icon: phosphorAgentIcon(mentionable.iconKey) }
        : mentionable,
    [mentionable]
  );
  return (
    <button
      type="button"
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
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-secondary-600">
        {row.icon ? <row.icon className="h-4 w-4" /> : null}
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

export { getFilteredMentionables as filterMentionables };
