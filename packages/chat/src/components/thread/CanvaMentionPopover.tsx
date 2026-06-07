'use client';

import { useEffect, useMemo, useState } from 'react';

import { useCanvaDesignsQuery, type ChatCanvaDesign } from '../../hooks/useMentionablesQuery';
import { type CanvaDesignToken } from '../../lib/mentionables';
import { MentionFloatingPanel } from './MentionFloatingPanel';

interface CanvaMentionPopoverProps {
  visible: boolean;
  onSelect: (designs: CanvaDesignToken[]) => void;
  onDismiss: () => void;
}

export function CanvaMentionPopover({ visible, onSelect, onDismiss }: CanvaMentionPopoverProps) {
  const [filter, setFilter] = useState('');
  const [debouncedFilter, setDebouncedFilter] = useState('');
  const [selection, setSelection] = useState<Map<string, ChatCanvaDesign>>(new Map());

  // Debounce the search term — Canva's list endpoint accepts a server-side query.
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

  const { data, isLoading, isError } = useCanvaDesignsQuery(debouncedFilter, visible);
  const designs = useMemo(() => data?.designs ?? [], [data]);
  const notConnected = !isLoading && data?.connected === false;
  const selectionList = [...selection.values()];

  const toggle = (design: ChatCanvaDesign) => {
    setSelection((prev) => {
      const next = new Map(prev);
      if (next.has(design.id)) next.delete(design.id);
      else next.set(design.id, design);
      return next;
    });
  };

  const handleConfirm = () => {
    if (selectionList.length === 0) return;
    onSelect(
      selectionList.map((d) => ({
        id: d.id,
        title: d.title,
        viewUrl: d.viewUrl,
        ...(d.thumbnailUrl ? { thumbnailUrl: d.thumbnailUrl } : {}),
      }))
    );
  };

  return (
    <MentionFloatingPanel
      open={visible}
      onDismiss={onDismiss}
      width="w-[360px]"
      role="dialog"
      ariaLabel="Canva-Designs auswählen"
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
            Canva-Designs
          </span>
          {!notConnected && (
            <div className="mt-2">
              <input
                type="text"
                autoFocus
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Designs durchsuchen…"
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary/40"
              />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {notConnected ? (
            <div className="flex flex-col items-start gap-2 px-3 py-4">
              <p className="text-sm font-medium text-foreground">Canva nicht verbunden</p>
              <p className="text-xs text-foreground-muted">
                Verbinde zuerst dein Canva-Konto unter Profil → Wolke, damit du Designs per @canva
                einfügen kannst.
              </p>
            </div>
          ) : isLoading ? (
            <div className="px-3 py-4 text-sm text-foreground-muted">Lade Designs…</div>
          ) : isError ? (
            <div className="px-3 py-4 text-sm text-foreground-muted">
              Fehler beim Laden der Designs.
            </div>
          ) : designs.length === 0 ? (
            <div className="px-3 py-4 text-sm text-foreground-muted">
              {debouncedFilter ? 'Keine Treffer.' : 'Keine Designs gefunden.'}
            </div>
          ) : (
            designs.map((design) => {
              const isSelected = selection.has(design.id);
              return (
                <button
                  key={design.id}
                  type="button"
                  aria-pressed={isSelected}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    toggle(design);
                  }}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                    isSelected
                      ? 'bg-primary/10 text-foreground'
                      : 'text-foreground-muted hover:bg-primary/5'
                  }`}
                >
                  {design.thumbnailUrl ? (
                    <img
                      src={design.thumbnailUrl}
                      alt=""
                      className="h-9 w-9 flex-shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded bg-primary/5 text-base"
                    >
                      🎨
                    </span>
                  )}
                  <span className="flex-1 truncate">{design.title}</span>
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
              disabled={selectionList.length === 0 || notConnected}
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
