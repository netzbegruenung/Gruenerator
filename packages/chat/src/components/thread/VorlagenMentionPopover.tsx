'use client';

import { useEffect, useMemo, useState } from 'react';

import { useVorlagenSearchQuery, type ChatVorlageTemplate } from '../../hooks/useMentionablesQuery';
import { type VorlageToken } from '../../lib/mentionables';
import { MentionFloatingPanel } from './MentionFloatingPanel';

interface VorlagenMentionPopoverProps {
  visible: boolean;
  onSelect: (vorlagen: VorlageToken[]) => void;
  onDismiss: () => void;
}

export function VorlagenMentionPopover({
  visible,
  onSelect,
  onDismiss,
}: VorlagenMentionPopoverProps) {
  const [filter, setFilter] = useState('');
  const [debouncedFilter, setDebouncedFilter] = useState('');
  const [selection, setSelection] = useState<Map<string, ChatVorlageTemplate>>(new Map());

  // Debounce the search term — the backend embeds it for a vector search.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedFilter(filter.trim()), 300);
    return () => clearTimeout(id);
  }, [filter]);

  useEffect(() => {
    if (!visible) {
      setSelection(new Map());
      setFilter('');
      setDebouncedFilter('');
    }
  }, [visible]);

  // Only query once the user has typed something — semantic search needs a term.
  const hasQuery = debouncedFilter.length > 0;
  const { data, isLoading, isError } = useVorlagenSearchQuery(debouncedFilter, visible && hasQuery);
  const vorlagen = useMemo(() => data?.vorlagen ?? [], [data]);
  const selectionList = [...selection.values()];

  const toggle = (vorlage: ChatVorlageTemplate) => {
    setSelection((prev) => {
      const next = new Map(prev);
      if (next.has(vorlage.id)) next.delete(vorlage.id);
      else next.set(vorlage.id, vorlage);
      return next;
    });
  };

  const handleConfirm = () => {
    if (selectionList.length === 0) return;
    onSelect(
      selectionList.map((v) => ({
        id: v.id,
        title: v.title,
        url: v.external_url ?? v.thumbnail_url ?? '',
        ...(v.thumbnail_url ? { thumbnailUrl: v.thumbnail_url } : {}),
      }))
    );
  };

  return (
    <MentionFloatingPanel
      open={visible}
      onDismiss={onDismiss}
      width="w-[360px]"
      role="dialog"
      ariaLabel="Vorlagen auswählen"
    >
      <div
        className="flex min-h-0 flex-1 flex-col"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onDismiss();
          }
        }}
      >
        <div className="border-b border-border px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground-muted/70">
            Vorlagen
          </span>
          <div className="mt-2">
            <input
              type="text"
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Vorlagen beschreiben…"
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary/40"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!hasQuery ? (
            <div className="px-3 py-4 text-sm text-foreground-muted">
              Beschreibe, wonach du suchst — die besten passenden Vorlagen werden per Vektorsuche
              gefunden.
            </div>
          ) : isLoading ? (
            <div className="px-3 py-4 text-sm text-foreground-muted">Suche Vorlagen…</div>
          ) : isError ? (
            <div className="px-3 py-4 text-sm text-foreground-muted">
              Fehler beim Laden der Vorlagen.
            </div>
          ) : vorlagen.length === 0 ? (
            <div className="px-3 py-4 text-sm text-foreground-muted">Keine Treffer.</div>
          ) : (
            vorlagen.map((vorlage) => {
              const isSelected = selection.has(vorlage.id);
              return (
                <button
                  key={vorlage.id}
                  type="button"
                  aria-pressed={isSelected}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    toggle(vorlage);
                  }}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                    isSelected
                      ? 'bg-primary/10 text-foreground'
                      : 'text-foreground-muted hover:bg-primary/5'
                  }`}
                >
                  {vorlage.thumbnail_url ? (
                    <img
                      src={vorlage.thumbnail_url}
                      alt=""
                      className="h-9 w-9 flex-shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded bg-primary/5 text-base"
                    >
                      📋
                    </span>
                  )}
                  <span className="flex-1 truncate">{vorlage.title}</span>
                  <span aria-hidden className="text-base">
                    {isSelected ? '☑️' : ''}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <span className="text-xs text-foreground-muted">{selectionList.length} ausgewählt</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onDismiss();
              }}
              className="rounded-md px-2 py-1 text-xs text-foreground-muted hover:bg-primary/5"
            >
              Abbrechen
            </button>
            <button
              type="button"
              disabled={selectionList.length === 0}
              onMouseDown={(e) => {
                e.preventDefault();
                handleConfirm();
              }}
              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              Einfügen
            </button>
          </div>
        </div>
      </div>
    </MentionFloatingPanel>
  );
}
