'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  useUserShareLinksQuery,
  useWolkeBrowseQuery,
  type ChatWolkeFile,
} from '../../hooks/useMentionablesQuery';
import { useChatConfigStore } from '../../stores/chatConfigStore';
import { encodeWolkeToken } from '../../lib/mentionables';

interface WolkeMentionPopoverProps {
  visible: boolean;
  onSelect: (tokens: string[]) => void;
  onDismiss: () => void;
}

interface SelectedFile {
  shareLinkId: string;
  path: string;
  name: string;
}

function joinPath(parent: string, name: string): string {
  if (!parent || parent === '/') return `/${name}`;
  return `${parent.replace(/\/$/, '')}/${name}`;
}

function parentOf(p: string): string {
  if (!p || p === '/') return '';
  const trimmed = p.replace(/\/$/, '');
  const idx = trimmed.lastIndexOf('/');
  return idx <= 0 ? '' : trimmed.slice(0, idx);
}

export function WolkeMentionPopover({ visible, onSelect, onDismiss }: WolkeMentionPopoverProps) {
  const wolkeConnectUrl = useChatConfigStore((s) => s.wolkeConnectUrl);
  const { data: shareLinks, isLoading: linksLoading } = useUserShareLinksQuery(visible);

  const [activeShareId, setActiveShareId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<string>('');
  const [filter, setFilter] = useState<string>('');
  const [selection, setSelection] = useState<Map<string, SelectedFile>>(new Map());

  useEffect(() => {
    if (!visible) return;
    if (!activeShareId && shareLinks && shareLinks.length > 0) {
      setActiveShareId(shareLinks[0].id);
    }
  }, [visible, shareLinks, activeShareId]);

  useEffect(() => {
    if (!visible) {
      setSelection(new Map());
      setFolderPath('');
      setFilter('');
    }
  }, [visible]);

  const browse = useWolkeBrowseQuery(activeShareId, folderPath, visible);

  const filteredFiles = useMemo(() => {
    const files = browse.data?.files ?? [];
    if (!filter) return files;
    const q = filter.toLowerCase();
    return files.filter((f) => f.name.toLowerCase().includes(q));
  }, [browse.data, filter]);

  if (!visible) return null;

  const hasNoShares = !linksLoading && (!shareLinks || shareLinks.length === 0);
  const selectionList = [...selection.values()];

  const toggleFile = (file: ChatWolkeFile) => {
    if (file.isDirectory || file.isSupported === false || !activeShareId) return;
    const path = joinPath(folderPath, file.name);
    const key = `${activeShareId}:${path}`;
    setSelection((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, { shareLinkId: activeShareId, path, name: file.name });
      }
      return next;
    });
  };

  const handleConfirm = () => {
    if (selectionList.length === 0) return;
    const tokens = selectionList.map((f) =>
      encodeWolkeToken({ shareLinkId: f.shareLinkId, path: f.path, name: f.name })
    );
    onSelect(tokens);
  };

  return (
    <div
      role="dialog"
      aria-label="Wolke-Dateien auswählen"
      className="mention-popover absolute z-50 flex max-h-[420px] w-[360px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg"
      style={{ bottom: '100%', left: 0, marginBottom: '0.5rem' }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onDismiss();
        }
      }}
    >
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground-muted/70">
            Wolke
          </span>
          {shareLinks && shareLinks.length > 1 && (
            <select
              value={activeShareId ?? ''}
              onChange={(e) => {
                setActiveShareId(e.target.value);
                setFolderPath('');
              }}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            >
              {shareLinks.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label || l.id.slice(0, 8)}
                </option>
              ))}
            </select>
          )}
        </div>
        {!hasNoShares && (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Dateien filtern…"
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary/40"
            />
          </div>
        )}
        {!hasNoShares && folderPath && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              setFolderPath(parentOf(folderPath));
              setFilter('');
            }}
            className="mt-2 text-xs text-foreground-muted hover:text-foreground"
          >
            ← {folderPath || '/'}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {hasNoShares ? (
          <div className="flex flex-col items-start gap-2 px-3 py-4">
            <p className="text-sm font-medium text-foreground">Keine Wolke verbunden</p>
            <p className="text-xs text-foreground-muted">
              Verbinde zuerst deinen Nextcloud-Ordner, damit du Dateien per @wolke einfügen kannst.
            </p>
            {wolkeConnectUrl && (
              <a
                href={wolkeConnectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90"
                onMouseDown={(e) => e.stopPropagation()}
              >
                Wolke verbinden
              </a>
            )}
          </div>
        ) : browse.isLoading ? (
          <div className="px-3 py-4 text-sm text-foreground-muted">Lade Dateien…</div>
        ) : browse.isError ? (
          <div className="px-3 py-4 text-sm text-foreground-muted">
            Fehler beim Laden der Dateien.
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="px-3 py-4 text-sm text-foreground-muted">
            {filter ? 'Keine Treffer.' : 'Ordner ist leer.'}
          </div>
        ) : (
          filteredFiles.map((file) => {
            const path = joinPath(folderPath, file.name);
            const key = `${activeShareId}:${path}`;
            const isSelected = selection.has(key);
            const isDisabled = !file.isDirectory && file.isSupported === false;
            return (
              <button
                key={key}
                type="button"
                disabled={isDisabled}
                aria-pressed={isSelected}
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (file.isDirectory) {
                    setFolderPath(path);
                    setFilter('');
                  } else {
                    toggleFile(file);
                  }
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  isSelected
                    ? 'bg-primary/10 text-foreground'
                    : isDisabled
                      ? 'cursor-not-allowed text-foreground-muted/50'
                      : 'text-foreground-muted hover:bg-primary/5'
                }`}
              >
                <span aria-hidden className="text-base">
                  {file.isDirectory ? '📁' : isSelected ? '☑️' : '📄'}
                </span>
                <span className="flex-1 truncate">{file.name}</span>
                {!file.isDirectory && (
                  <span className="text-xs text-foreground-muted/70">{file.sizeFormatted}</span>
                )}
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
            disabled={selectionList.length === 0 || hasNoShares}
            onMouseDown={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            Hinzufügen
          </button>
        </div>
      </div>
    </div>
  );
}
