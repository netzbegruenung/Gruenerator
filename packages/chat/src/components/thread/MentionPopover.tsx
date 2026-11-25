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
    <MentionFloatingPanel
      open={isOpen}
      onDismiss={onDismiss}
      width="w-[min(36rem,var(--radix-popover-trigger-width))]"
      role="listbox"
    >
      <div ref={listRef} className="overflow-y-auto py-1">
        {sections.map((section) =>
          section.kind === 'flat' ? (
            <div key={section.label}>
              <MentionGroupHeader label={section.label} />
              {section.items.map((item) => {
                const idx = itemIndex++;
                return (
                  <MentionItem
                    key={mentionableKey(item)}
                    mentionable={item}
                    query={query}
                    isSelected={idx === selectedIndex}
                    onSelect={onSelect}
                  />
                );
              })}
            </div>
          ) : (
            section.groups.map((group) => (
              <div key={`${section.label}:${group.sublabel}`} data-mention-group>
                <MentionGroupHeader label={section.label} sublabel={group.sublabel} />
                {group.items.map((item) => {
                  const idx = itemIndex++;
                  return (
                    <MentionItem
                      key={mentionableKey(item)}
                      mentionable={item}
                      query={query}
                      isSelected={idx === selectedIndex}
                      onSelect={onSelect}
                    />
                  );
                })}
              </div>
            ))
          )
        )}
      </div>
    </MentionFloatingPanel>
  );
}

/** One sticky header line per group: "REZEPTE · EIGENE" instead of two stacked labels. */
function MentionGroupHeader({ label, sublabel }: { label: string; sublabel?: string }) {
  return (
    <div className="sticky top-0 z-[1] flex gap-1 bg-background px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-foreground-muted/60">
      <span>{label}</span>
      {sublabel ? (
        <>
          <span aria-hidden="true">·</span>
          <span>{sublabel}</span>
        </>
      ) : null}
    </div>
  );
}

/** Bolds the first case-insensitive occurrence of `query` in `text`. */
function HighlightedTitle({ text, query }: { text: string; query: string }) {
  const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <strong className="font-semibold">{text.slice(at, at + query.length)}</strong>
      {text.slice(at + query.length)}
    </>
  );
}

function MentionItem({
  mentionable,
  query,
  isSelected,
  onSelect,
}: {
  mentionable: Mentionable;
  query: string;
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
  const handle = `${mentionable.trigger}${mentionable.mention}`;
  const description =
    (mentionable.type === 'agent' || mentionable.type === 'textform') && mentionable.description
      ? mentionable.description
      : null;
  // Without a description the handle is the only hint what a row is. With one,
  // the handle only shows when it alone explains the match (`@insta` → "Insta Hessen"
  // matches, `@presse-hessen-partei` would not be visible in the title).
  const q = query.toLowerCase();
  const matchedOnlyByHandle =
    q.length > 0 &&
    !mentionable.title.toLowerCase().includes(q) &&
    mentionable.mention.toLowerCase().includes(q);
  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      data-selected={isSelected}
      data-mention={handle}
      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${
        isSelected ? 'bg-primary/10 text-foreground' : 'text-foreground-muted hover:bg-primary/5'
      }`}
      onMouseDown={(e) => {
        e.preventDefault();
        onSelect(mentionable);
      }}
    >
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-secondary-600">
        {row.icon ? <row.icon className="h-4 w-4" /> : null}
      </span>
      <span
        data-part="title"
        className="max-w-[60%] flex-shrink-0 truncate text-sm text-foreground"
      >
        <HighlightedTitle text={mentionable.title} query={query} />
      </span>
      {description ? (
        <span
          data-part="description"
          className="min-w-0 flex-1 truncate text-xs text-foreground-muted"
        >
          {description}
        </span>
      ) : (
        <span data-part="handle" className="min-w-0 flex-1 truncate text-xs text-foreground-muted">
          {handle}
        </span>
      )}
      {description && matchedOnlyByHandle ? (
        <span data-part="handle" className="flex-shrink-0 text-xs text-foreground-muted">
          {handle}
        </span>
      ) : null}
    </button>
  );
}

export { getFilteredMentionables as filterMentionables };
