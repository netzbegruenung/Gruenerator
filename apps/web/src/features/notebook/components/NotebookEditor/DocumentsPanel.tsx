import { Button, Input, SectionHeader } from '@gruenerator/ui';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useMemo, useRef, useState } from 'react';
import { HiSearch, HiX } from 'react-icons/hi';

import { cn } from '../../../../utils/cn';

import { DocumentRow, DOCUMENT_ROW_HEIGHT } from './DocumentRow';
import {
  DOCUMENT_SOURCE_LABELS,
  MAX_DOCUMENTS,
  type DocumentSource,
  type DocumentWithSource,
} from './shared';

/** Above this many documents the list scrolls inside a fixed viewport instead of growing the page. */
const VIRTUAL_VIEWPORT_HEIGHT = 520;
const SOURCE_ORDER: DocumentSource[] = ['upload', 'wolke', 'docs', 'wordpress'];

interface DocumentsPanelProps {
  documents: DocumentWithSource[];
  documentCount: number;
  indexingDocIds: Set<string>;
  loading: boolean;
  onRemove: (id: string) => void;
  onRemoveMany: (ids: string[]) => void;
  onAddClick: () => void;
}

export default function DocumentsPanel({
  documents,
  documentCount,
  indexingDocIds,
  loading,
  onRemove,
  onRemoveMany,
  onAddClick,
}: DocumentsPanelProps) {
  const [query, setQuery] = useState('');
  const [activeSource, setActiveSource] = useState<DocumentSource | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const countsBySource = useMemo(() => {
    const counts: Record<DocumentSource, number> = { upload: 0, wolke: 0, docs: 0, wordpress: 0 };
    for (const entry of documents) counts[entry.source] += 1;
    return counts;
  }, [documents]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return documents.filter((entry) => {
      if (activeSource && entry.source !== activeSource) return false;
      if (!needle) return true;
      const name = (entry.doc.filename || entry.doc.title).toLowerCase();
      return name.includes(needle);
    });
  }, [documents, query, activeSource]);

  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => DOCUMENT_ROW_HEIGHT,
    overscan: 8,
  });

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const visibleSelectedIds = useMemo(
    () => visible.filter((e) => selectedIds.has(e.doc.id)).map((e) => e.doc.id),
    [visible, selectedIds]
  );
  const allVisibleSelected = visible.length > 0 && visibleSelectedIds.length === visible.length;

  const handleRemoveSelected = useCallback(() => {
    onRemoveMany(visibleSelectedIds);
    setSelectedIds(new Set());
  }, [onRemoveMany, visibleSelectedIds]);

  const filtered = Boolean(query.trim()) || activeSource !== null;

  return (
    <>
      <SectionHeader
        title="Dokumente"
        onCreate={onAddClick}
        createLabel="Dokumente hinzufügen"
        actions={
          <span
            className="text-sm text-grey-500"
            title="Alle Quellen zusammen — Uploads, Wolke, verlinkte Docs und WordPress."
          >
            {documentCount}/{MAX_DOCUMENTS} gesamt
          </span>
        }
      />

      {documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-grey-300 px-md py-xl text-center dark:border-grey-700">
          <p className="m-0 text-sm font-medium text-foreground">Noch keine Dokumente</p>
          <p className="m-0 mt-xs text-sm text-grey-500">
            Ziehe Dateien hierher oder füge oben eine Quelle hinzu.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-md">
          <div className="flex flex-col gap-sm sm:flex-row sm:items-center">
            <div className="relative sm:max-w-xs sm:flex-1">
              <HiSearch
                size={14}
                className="pointer-events-none absolute left-sm top-1/2 -translate-y-1/2 text-grey-400"
                aria-hidden
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Dokumente durchsuchen…"
                aria-label="Dokumente durchsuchen"
                className="pl-[2rem]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-xs">
              <FilterChip
                label="Alle"
                count={documents.length}
                active={activeSource === null}
                onClick={() => setActiveSource(null)}
              />
              {SOURCE_ORDER.filter((s) => countsBySource[s] > 0).map((source) => (
                <FilterChip
                  key={source}
                  label={DOCUMENT_SOURCE_LABELS[source]}
                  count={countsBySource[source]}
                  active={activeSource === source}
                  onClick={() => setActiveSource(activeSource === source ? null : source)}
                />
              ))}
            </div>
          </div>

          <div className="flex min-h-[1.75rem] items-center justify-between gap-sm">
            <label className="flex cursor-pointer items-center gap-sm text-xs text-grey-500">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={(e) =>
                  setSelectedIds(
                    e.target.checked ? new Set(visible.map((v) => v.doc.id)) : new Set()
                  )
                }
                className="size-4 cursor-pointer accent-primary-600"
                aria-label="Alle sichtbaren Dokumente auswählen"
              />
              <span>
                {filtered
                  ? `${visible.length} von ${documents.length} angezeigt`
                  : 'Alle auswählen'}
              </span>
            </label>

            {visibleSelectedIds.length > 0 && (
              <div className="flex items-center gap-sm">
                <span className="text-xs text-grey-500">
                  {visibleSelectedIds.length} ausgewählt
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRemoveSelected}
                  disabled={loading}
                >
                  <HiX size={12} />
                  Entfernen
                </Button>
              </div>
            )}
          </div>

          {visible.length === 0 ? (
            <p className="m-0 px-sm py-lg text-center text-sm text-grey-500">
              Keine Dokumente gefunden.
            </p>
          ) : (
            <div
              ref={scrollRef}
              className="overflow-y-auto"
              style={{
                maxHeight: VIRTUAL_VIEWPORT_HEIGHT,
                // Short lists shouldn't reserve a scroll viewport they never fill.
                height: Math.min(visible.length * DOCUMENT_ROW_HEIGHT, VIRTUAL_VIEWPORT_HEIGHT),
              }}
            >
              <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
                {virtualizer.getVirtualItems().map((item) => {
                  const entry = visible[item.index];
                  return (
                    <div
                      key={entry.doc.id}
                      className="absolute inset-x-0 top-0"
                      style={{ height: item.size, transform: `translateY(${item.start}px)` }}
                    >
                      <DocumentRow
                        doc={entry.doc}
                        source={entry.source}
                        indexing={indexingDocIds.has(entry.doc.id)}
                        selected={selectedIds.has(entry.doc.id)}
                        loading={loading}
                        onToggleSelect={toggleSelect}
                        onRemove={onRemove}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-sm py-[0.2rem] text-xs transition-colors',
        active
          ? 'border-primary-500 bg-primary-50 text-primary-800 dark:bg-primary-950/40 dark:text-primary-200'
          : 'border-grey-200 text-grey-600 hover:bg-background-alt dark:border-grey-700 dark:text-grey-400'
      )}
    >
      {label}
      <span className="ml-xs opacity-60">{count}</span>
    </button>
  );
}
