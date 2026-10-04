'use client';

import { ApiError } from '@gruenerator/shared/api';
import { useEffect, useMemo, useState } from 'react';

import {
  useConnectBrowseQuery,
  useConnectProvidersQuery,
  useUserShareLinksQuery,
  useWolkeBrowseQuery,
} from '../../hooks/useMentionablesQuery';
import { type ConnectFileToken, type WolkeFileToken } from '../../lib/mentionables';
import { joinWolkePath, wolkeParentPath } from '../../lib/wolkePath';
import { useChatConfigStore } from '../../stores/chatConfigStore';

import { MentionFloatingPanel } from './MentionFloatingPanel';

/**
 * Ein Browser für alle Ablagen: Wolke-Freigaben, OneDrive und Google Drive.
 *
 * Die Wolke adressiert über Pfade, die Laufwerke über IDs; beides wird hier zu
 * derselben Zeile, und die Auswahl darf über Quellen hinweg gesammelt werden.
 * Gelesen werden die Dateien erst beim Senden (`wolkeRetrieval`/`connectRetrieval`).
 */

/** Welche Quelle beim Öffnen vorgewählt ist. `drive` = das erste verbundene Laufwerk. */
export type CloudSourceHint = 'wolke' | 'drive' | 'microsoft' | 'google';

export interface CloudSelection {
  wolke: WolkeFileToken[];
  connect: ConnectFileToken[];
}

interface CloudFileBrowserProps {
  visible: boolean;
  initialSource: CloudSourceHint;
  onSelect: (selection: CloudSelection) => void;
  onDismiss: () => void;
}

type Source =
  { kind: 'wolke'; id: string; label: string } | { kind: 'drive'; id: string; label: string };

/** Eine Ebene im Laufwerk: die ID für die Abfrage, der Name für die Anzeige. */
interface DriveCrumb {
  id: string;
  name: string;
}

interface Row {
  key: string;
  name: string;
  isFolder: boolean;
  isSupported: boolean;
  size?: string;
  open: () => void;
  pick: () => Picked;
}

type Picked =
  { kind: 'wolke'; token: WolkeFileToken } | { kind: 'connect'; token: ConnectFileToken };

const DRIVE_LABELS: Record<string, string> = { microsoft: 'OneDrive', google: 'Google Drive' };

function pickInitial(sources: Source[], hint: CloudSourceHint): Source | null {
  const match =
    hint === 'wolke'
      ? sources.find((s) => s.kind === 'wolke')
      : hint === 'drive'
        ? sources.find((s) => s.kind === 'drive')
        : sources.find((s) => s.kind === 'drive' && s.id === hint);
  return match ?? sources[0] ?? null;
}

export function CloudFileBrowser({
  visible,
  initialSource,
  onSelect,
  onDismiss,
}: CloudFileBrowserProps) {
  const wolkeConnectUrl = useChatConfigStore((s) => s.wolkeConnectUrl);
  const shareLinks = useUserShareLinksQuery(visible);
  const providers = useConnectProvidersQuery(visible);

  const sources = useMemo<Source[]>(
    () => [
      ...(shareLinks.data ?? []).map((l) => ({
        kind: 'wolke' as const,
        id: l.id,
        label:
          (shareLinks.data?.length ?? 0) > 1 ? `Wolke · ${l.label || l.id.slice(0, 8)}` : 'Wolke',
      })),
      ...(providers.data ?? []).map((p) => ({
        kind: 'drive' as const,
        id: p.provider,
        label: DRIVE_LABELS[p.provider] ?? p.label,
      })),
    ],
    [shareLinks.data, providers.data]
  );
  const sourcesLoading = shareLinks.isLoading || providers.isLoading;

  const [active, setActive] = useState<Source | null>(null);
  const [wolkePath, setWolkePath] = useState('');
  const [driveTrail, setDriveTrail] = useState<DriveCrumb[]>([]);
  const [filter, setFilter] = useState('');
  const [selection, setSelection] = useState<Map<string, Picked>>(new Map());

  useEffect(() => {
    if (!visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets panel state on close (visibility transition), not a render-derived value
      setActive(null);
      setWolkePath('');
      setDriveTrail([]);
      setSelection(new Map());
      setFilter('');
      return;
    }
    if (!active && !sourcesLoading) {
      setActive(pickInitial(sources, initialSource));
    }
  }, [visible, active, sources, sourcesLoading, initialSource]);

  const switchTo = (source: Source) => {
    setActive(source);
    setWolkePath('');
    setDriveTrail([]);
    setFilter('');
  };

  const driveFolderId = driveTrail.at(-1)?.id ?? null;
  const wolke = useWolkeBrowseQuery(
    active?.kind === 'wolke' ? active.id : null,
    wolkePath,
    visible && active?.kind === 'wolke'
  );
  const drive = useConnectBrowseQuery(
    active?.kind === 'drive' ? active.id : null,
    driveFolderId,
    visible && active?.kind === 'drive'
  );
  const browse = active?.kind === 'drive' ? drive : wolke;
  const needsReconnect = drive.error instanceof ApiError && drive.error.status === 403;

  const rows = useMemo<Row[]>(() => {
    if (!active) return [];
    if (active.kind === 'wolke') {
      return (wolke.data?.files ?? []).map((f) => {
        const path = joinWolkePath(wolkePath, f.name);
        return {
          key: `wolke:${active.id}:${path}`,
          name: f.name,
          isFolder: Boolean(f.isDirectory),
          isSupported: f.isSupported !== false,
          size: f.sizeFormatted,
          open: () => setWolkePath(path),
          pick: () => ({
            kind: 'wolke',
            token: { shareLinkId: active.id, path, name: f.name },
          }),
        };
      });
    }
    return (drive.data ?? []).map((f) => ({
      key: `drive:${active.id}:${f.id}`,
      name: f.name,
      isFolder: Boolean(f.isDirectory),
      isSupported: f.isSupported !== false,
      size: f.sizeFormatted,
      open: () => setDriveTrail((trail) => [...trail, { id: f.id, name: f.name }]),
      pick: () => ({
        kind: 'connect',
        token: {
          provider: active.id,
          fileId: f.id,
          name: f.name,
          ...(f.mimeType ? { mimeType: f.mimeType } : {}),
        },
      }),
    }));
  }, [active, wolke.data, drive.data, wolkePath]);

  const visibleRows = useMemo(() => {
    if (!filter) return rows;
    const q = filter.toLowerCase();
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, filter]);

  const location = active?.kind === 'wolke' ? wolkePath : driveTrail.map((c) => c.name).join('/');
  const canGoUp = active?.kind === 'wolke' ? wolkePath !== '' : driveTrail.length > 0;
  const goUp = () => {
    if (active?.kind === 'wolke') setWolkePath(wolkeParentPath(wolkePath));
    else setDriveTrail((trail) => trail.slice(0, -1));
    setFilter('');
  };

  const toggle = (row: Row) => {
    if (row.isFolder || !row.isSupported) return;
    setSelection((prev) => {
      const next = new Map(prev);
      if (next.has(row.key)) next.delete(row.key);
      else next.set(row.key, row.pick());
      return next;
    });
  };

  const handleConfirm = () => {
    const picked = [...selection.values()];
    if (picked.length === 0) return;
    onSelect({
      wolke: picked.flatMap((p) => (p.kind === 'wolke' ? [p.token] : [])),
      connect: picked.flatMap((p) => (p.kind === 'connect' ? [p.token] : [])),
    });
  };

  const hasNoSources = !sourcesLoading && sources.length === 0;

  return (
    <MentionFloatingPanel
      open={visible}
      onDismiss={onDismiss}
      width="w-[380px]"
      role="dialog"
      ariaLabel="Dateien aus der Cloud auswählen"
    >
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- Escape-only capture inside the already-labeled dialog panel above, not new interactive semantics. */}
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
            Aus der Cloud
          </span>
          {sources.length > 1 && (
            <div role="tablist" aria-label="Ablage" className="mt-2 flex flex-wrap gap-1">
              {sources.map((s) => {
                const isActive = active?.kind === s.kind && active.id === s.id;
                return (
                  <button
                    key={`${s.kind}:${s.id}`}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      switchTo(s);
                    }}
                    className={`rounded-md px-2 py-1 text-xs transition-colors ${
                      isActive
                        ? 'bg-primary/10 font-medium text-foreground'
                        : 'text-foreground-muted hover:bg-primary/5'
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          )}
          {active && (
            <input
              type="text"
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Dateien filtern…"
              aria-label="Dateien filtern"
              className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary/40"
            />
          )}
          {canGoUp && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                goUp();
              }}
              className="mt-2 max-w-full truncate text-xs text-foreground-muted hover:text-foreground"
            >
              ← {location}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {hasNoSources ? (
            <div className="flex flex-col items-start gap-2 px-3 py-4">
              <p className="text-sm font-medium text-foreground">Keine Ablage verbunden</p>
              <p className="text-xs text-foreground-muted">
                Verbinde zuerst einen Wolke-Ordner, damit du Dateien daraus einfügen kannst.
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
          ) : sourcesLoading || browse.isLoading ? (
            <div className="px-3 py-4 text-sm text-foreground-muted">Lade Dateien…</div>
          ) : needsReconnect ? (
            <div className="px-3 py-4 text-sm text-foreground-muted">
              Der Zugang zu {active?.label} ist abgelaufen. Bitte verbinde das Konto neu.
            </div>
          ) : browse.isError ? (
            <div className="px-3 py-4 text-sm text-foreground-muted">
              Fehler beim Laden der Dateien.
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="px-3 py-4 text-sm text-foreground-muted">
              {filter ? 'Keine Treffer.' : 'Ordner ist leer.'}
            </div>
          ) : (
            visibleRows.map((row) => {
              const isSelected = selection.has(row.key);
              const isDisabled = !row.isFolder && !row.isSupported;
              return (
                <button
                  key={row.key}
                  type="button"
                  disabled={isDisabled}
                  aria-pressed={row.isFolder ? undefined : isSelected}
                  title={isDisabled ? 'Dieses Format kann der Chat nicht lesen' : undefined}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (row.isFolder) {
                      row.open();
                      setFilter('');
                    } else {
                      toggle(row);
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
                    {row.isFolder ? '📁' : isSelected ? '☑️' : '📄'}
                  </span>
                  <span className="flex-1 truncate">{row.name}</span>
                  {!row.isFolder && row.size && (
                    <span className="text-xs text-foreground-muted/70">{row.size}</span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <span className="text-xs text-foreground-muted">{selection.size} ausgewählt</span>
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
              disabled={selection.size === 0}
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
