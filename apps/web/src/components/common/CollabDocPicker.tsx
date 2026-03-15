import { Popover, PopoverContent, PopoverTrigger } from '@gruenerator/ui';
import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { FiFileText, FiSearch } from 'react-icons/fi';

interface CollabDoc {
  id: string;
  title: string;
}

interface CollabDocPickerProps {
  onSelect: (doc: CollabDoc) => void;
  excludeIds?: string[];
  children: ReactNode;
}

export function CollabDocPicker({ onSelect, excludeIds = [], children }: CollabDocPickerProps) {
  const [open, setOpen] = useState(false);
  const [docs, setDocs] = useState<CollabDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/docs', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          setDocs(
            data
              .filter((d: { document_subtype?: string }) => d.document_subtype !== 'boards')
              .map((d: { id: string; title: string }) => ({ id: d.id, title: d.title }))
          );
        }
      })
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, [open]);

  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return docs
      .filter((d) => !excludeSet.has(d.id))
      .filter((d) => !q || d.title.toLowerCase().includes(q));
  }, [docs, excludeSet, search]);

  const handleSelect = (doc: CollabDoc) => {
    onSelect(doc);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="p-2 border-b border-grey-200 dark:border-grey-700">
          <div className="flex items-center gap-2 rounded-md border border-grey-200 dark:border-grey-700 px-2 py-1.5">
            <FiSearch size={13} className="text-grey-400 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Dokument suchen..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-grey-400"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto">
          {loading && <p className="px-3 py-4 text-xs text-grey-400 text-center">Laden...</p>}
          {!loading && filtered.length === 0 && (
            <p className="px-3 py-4 text-xs text-grey-400 text-center">Keine Dokumente gefunden</p>
          )}
          {!loading &&
            filtered.map((doc) => (
              <button
                key={doc.id}
                onClick={() => handleSelect(doc)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground hover:bg-grey-100 dark:hover:bg-grey-800 transition-colors bg-transparent border-none cursor-pointer"
              >
                <FiFileText size={14} className="text-grey-400 shrink-0" />
                <span className="truncate">{doc.title}</span>
              </button>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
