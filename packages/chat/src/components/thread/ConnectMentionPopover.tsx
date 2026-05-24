'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  useConnectProvidersQuery,
  useConnectBrowseQuery,
  type ChatConnectFile,
} from '../../hooks/useMentionablesQuery';
import { type ConnectFileToken } from '../../lib/mentionables';
import { MentionFloatingPanel } from './MentionFloatingPanel';

interface ConnectMentionPopoverProps {
  visible: boolean;
  onSelect: (files: ConnectFileToken[]) => void;
  onDismiss: () => void;
}

interface SelectedFile {
  provider: string;
  fileId: string;
  name: string;
  mimeType?: string;
}

export function ConnectMentionPopover({
  visible,
  onSelect,
  onDismiss,
}: ConnectMentionPopoverProps) {
  const { data: providers, isLoading: providersLoading } = useConnectProvidersQuery(visible);

  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('');
  const [selection, setSelection] = useState<Map<string, SelectedFile>>(new Map());

  useEffect(() => {
    if (!visible) {
      setSelection(new Map());
      setActiveProvider(null);
      setFolderId(null);
      setFilter('');
    }
  }, [visible]);

  const browse = useConnectBrowseQuery(activeProvider, folderId, visible && !!activeProvider);

  const filteredFiles = useMemo(() => {
    const files = browse.data ?? [];
    if (!filter) return files;
    const q = filter.toLowerCase();
    return files.filter((f) => f.name.toLowerCase().includes(q));
  }, [browse.data, filter]);

  const hasNoProviders = !providersLoading && (!providers || providers.length === 0);
  const selectionList = [...selection.values()];

  const toggleFile = (file: ChatConnectFile) => {
    if (file.isDirectory || !activeProvider) return;
    const key = `${activeProvider}:${file.id}`;
    setSelection((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, {
          provider: activeProvider,
          fileId: file.id,
          name: file.name,
          ...(file.mimeType ? { mimeType: file.mimeType } : {}),
        });
      }
      return next;
    });
  };

  const handleConfirm = () => {
    if (selectionList.length === 0) return;
    onSelect(
      selectionList.map((f) => ({
        provider: f.provider,
        fileId: f.fileId,
        name: f.name,
        ...(f.mimeType ? { mimeType: f.mimeType } : {}),
      }))
    );
  };

  return (
    <MentionFloatingPanel
      open={visible}
      onDismiss={onDismiss}
      width="w-[360px]"
      role="dialog"
      ariaLabel="Dateien aus verbundenen Accounts auswählen"
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
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-foreground-muted/70">
              Verbundene Accounts
            </span>
            {activeProvider && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setActiveProvider(null);
                  setFolderId(null);
                  setFilter('');
                }}
                className="text-xs text-foreground-muted hover:text-foreground"
              >
                ← Dienste
              </button>
            )}
          </div>
          {activeProvider && !hasNoProviders && (
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
        </div>

        <div className="flex-1 overflow-y-auto">
          {hasNoProviders ? (
            <div className="flex flex-col items-start gap-2 px-3 py-4">
              <p className="text-sm font-medium text-foreground">Keine Accounts verbunden</p>
              <p className="text-xs text-foreground-muted">
                Verbinde zuerst einen Dienst (Microsoft, Google, Jira, Confluence) unter
                Einstellungen, damit du Dateien per @connect einfügen kannst.
              </p>
            </div>
          ) : !activeProvider ? (
            providersLoading ? (
              <div className="px-3 py-4 text-sm text-foreground-muted">Lade Dienste…</div>
            ) : (
              (providers ?? []).map((p) => (
                <button
                  key={p.provider}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setActiveProvider(p.provider);
                    setFolderId(null);
                    setFilter('');
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground-muted transition-colors hover:bg-primary/5"
                >
                  <span aria-hidden className="text-base">
                    🔌
                  </span>
                  <span className="flex-1 truncate">{p.label}</span>
                </button>
              ))
            )
          ) : browse.isLoading ? (
            <div className="px-3 py-4 text-sm text-foreground-muted">Lade Dateien…</div>
          ) : browse.isError ? (
            <div className="px-3 py-4 text-sm text-foreground-muted">
              Fehler beim Laden der Dateien.
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="px-3 py-4 text-sm text-foreground-muted">
              {filter ? 'Keine Treffer.' : 'Keine Dateien.'}
            </div>
          ) : (
            filteredFiles.map((file) => {
              const key = `${activeProvider}:${file.id}`;
              const isSelected = selection.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={isSelected}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (file.isDirectory) {
                      setFolderId(file.id);
                      setFilter('');
                    } else {
                      toggleFile(file);
                    }
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                    isSelected
                      ? 'bg-primary/10 text-foreground'
                      : 'text-foreground-muted hover:bg-primary/5'
                  }`}
                >
                  <span aria-hidden className="text-base">
                    {file.isDirectory ? '📁' : isSelected ? '☑️' : '📄'}
                  </span>
                  <span className="flex-1 truncate">{file.name}</span>
                  {!file.isDirectory && file.sizeFormatted && (
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
              disabled={selectionList.length === 0 || hasNoProviders}
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
    </MentionFloatingPanel>
  );
}
