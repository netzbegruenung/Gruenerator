import { type WolkeFolderRef } from '@gruenerator/contracts';
import { Badge, Button } from '@gruenerator/ui';
import { useShareLinks, type ShareLink } from '@gruenerator/wolke';
import { useState, useCallback, useMemo } from 'react';
import { HiCloud, HiPlus, HiRefresh, HiX, HiExclamation } from 'react-icons/hi';
import { Link } from 'react-router-dom';

import { useDocumentsStore } from '../../../stores/documentsStore';
import { cn } from '../../../utils/cn';

export interface ImportedWolkeDocument {
  id: string;
  title: string;
}

interface Props {
  folders: WolkeFolderRef[];
  onFoldersChange: (next: WolkeFolderRef[]) => void;
  remainingSlots: number;
  /** Called with newly synced documents — parent appends to its list and starts indexing polling. */
  onDocsImported: (docs: ImportedWolkeDocument[]) => void;
  disabled: boolean;
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'Noch nicht synchronisiert';
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (Number.isNaN(then)) return 'Noch nicht synchronisiert';
  if (diff < 60_000) return 'Synchronisiert vor wenigen Sekunden';
  if (diff < 3_600_000) return `Synchronisiert vor ${Math.round(diff / 60_000)} Min.`;
  if (diff < 86_400_000) return `Synchronisiert vor ${Math.round(diff / 3_600_000)} Std.`;
  return `Synchronisiert am ${new Date(iso).toLocaleDateString('de-DE')}`;
}

function pickShareLabel(link: ShareLink): string {
  return (
    link.label?.trim() || link.display_name?.trim() || link.folder_name?.trim() || 'Wolke-Ordner'
  );
}

const NotebookEditorWolkeSection = ({
  folders,
  onFoldersChange,
  remainingSlots,
  onDocsImported,
  disabled,
}: Props) => {
  const shareLinksQuery = useShareLinks();
  const { browseWolkeFiles, importWolkeFiles } = useDocumentsStore();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const attachedIds = useMemo(() => new Set(folders.map((f) => f.shareLinkId)), [folders]);
  const availableLinks = useMemo(
    () => (shareLinksQuery.data ?? []).filter((l) => !attachedIds.has(l.id)),
    [shareLinksQuery.data, attachedIds]
  );

  const handleAttach = useCallback(
    (link: ShareLink) => {
      const next: WolkeFolderRef = {
        shareLinkId: link.id,
        shareLabel: pickShareLabel(link),
        folderPath: '',
        folderName: pickShareLabel(link),
        lastSyncedAt: null,
      };
      onFoldersChange([...folders, next]);
      setPickerOpen(false);
      setError(null);
    },
    [folders, onFoldersChange]
  );

  const handleRemove = useCallback(
    (shareLinkId: string) => {
      onFoldersChange(folders.filter((f) => f.shareLinkId !== shareLinkId));
    },
    [folders, onFoldersChange]
  );

  const handleSync = useCallback(
    async (folder: WolkeFolderRef) => {
      setSyncingId(folder.shareLinkId);
      setError(null);
      try {
        const browseResult = await browseWolkeFiles(folder.shareLinkId);
        const supported = browseResult.files.filter((f) => f.isSupported);
        if (supported.length === 0) {
          setError(`Keine unterstützten Dateien in "${folder.folderName}" gefunden.`);
          return;
        }

        const sliced = supported.slice(0, Math.max(0, remainingSlots));
        const skipped = supported.length - sliced.length;
        if (sliced.length === 0) {
          setError('Notebook ist voll (max. 20 Dokumente).');
          return;
        }

        const result = await importWolkeFiles(folder.shareLinkId, sliced);
        const imported = (result.results ?? [])
          .filter((r) => r.success && r.documentId)
          .map((r) => ({ id: r.documentId as string, title: r.filename }));

        const alreadyImported = (result.results ?? []).filter(
          (r) => r.skipped && r.documentId && r.reason === 'already_imported'
        );
        if (alreadyImported.length > 0) {
          onDocsImported(
            alreadyImported.map((r) => ({ id: r.documentId as string, title: r.filename }))
          );
        }

        if (imported.length > 0) {
          onDocsImported(imported);
        }

        const syncedAt = new Date().toISOString();
        onFoldersChange(
          folders.map((f) =>
            f.shareLinkId === folder.shareLinkId ? { ...f, lastSyncedAt: syncedAt } : f
          )
        );

        if (skipped > 0) {
          setError(
            `${skipped} Datei${skipped === 1 ? '' : 'en'} übersprungen — max. 20 pro Notebook.`
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Synchronisation fehlgeschlagen.');
      } finally {
        setSyncingId(null);
      }
    },
    [browseWolkeFiles, importWolkeFiles, remainingSlots, folders, onFoldersChange, onDocsImported]
  );

  const isLoading = shareLinksQuery.isLoading;
  const hasShareLinks = (shareLinksQuery.data ?? []).length > 0;

  return (
    <section className="rounded-xl bg-background-alt/50 px-sm py-sm">
      <header className="flex flex-wrap items-center justify-between gap-xs pb-xs">
        <div className="flex items-center gap-xs">
          <HiCloud className="text-grey-400" size={16} aria-hidden />
          <span className="text-sm font-semibold text-foreground">Wolke-Ordner</span>
          <Badge
            variant="outline"
            className="border-amber-300 bg-amber-50 text-[10px] uppercase text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
          >
            Experimentell
          </Badge>
        </div>
        {hasShareLinks && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || availableLinks.length === 0}
            onClick={() => setPickerOpen((v) => !v)}
            aria-label="Wolke-Ordner hinzufügen"
          >
            <HiPlus size={14} />
            Ordner hinzufügen
          </Button>
        )}
      </header>

      {isLoading ? (
        <div className="h-16 animate-pulse rounded-md bg-grey-100 dark:bg-grey-900" />
      ) : !hasShareLinks ? (
        <div className="flex flex-col items-start gap-xs rounded-lg border border-dashed border-grey-300 bg-background p-md dark:border-grey-700">
          <p className="m-0 text-sm text-foreground">Du hast noch keine Wolke verbunden.</p>
          <p className="m-0 text-xs text-grey-500">
            Verbinde sie einmal und du kannst hier ganze Ordner als Quelle hinzufügen.
          </p>
          <Button asChild type="button" size="sm" className="mt-xs">
            <Link to="/profile/wolke">Wolke verbinden →</Link>
          </Button>
        </div>
      ) : (
        <>
          {pickerOpen && availableLinks.length > 0 && (
            <div className="mb-xs flex flex-col gap-1 rounded-lg border border-grey-200 bg-background p-xs dark:border-grey-700">
              <p className="m-0 px-1 pb-1 text-xs uppercase tracking-wide text-grey-500">
                Verbundene Wolken
              </p>
              {availableLinks.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  className="flex items-center gap-sm rounded-md px-sm py-xs text-left transition-colors hover:bg-background-alt"
                  onClick={() => handleAttach(link)}
                >
                  <HiCloud size={14} className="shrink-0 text-grey-400" aria-hidden />
                  <span className="truncate text-sm text-foreground">{pickShareLabel(link)}</span>
                </button>
              ))}
            </div>
          )}

          {folders.length === 0 && !pickerOpen && (
            <p className="m-0 text-xs text-grey-500">
              Noch kein Ordner verknüpft — füge einen hinzu und synchronisiere ihn manuell.
            </p>
          )}

          {folders.length > 0 && (
            <ul className="flex flex-col gap-xs">
              {folders.map((folder) => {
                const isSyncing = syncingId === folder.shareLinkId;
                return (
                  <li
                    key={folder.shareLinkId}
                    className={cn(
                      'group flex items-center gap-sm rounded-lg border border-grey-200 bg-background p-sm dark:border-grey-800',
                      isSyncing && 'opacity-90'
                    )}
                  >
                    <HiCloud size={16} className="shrink-0 text-grey-400" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">
                        {folder.folderName}
                      </div>
                      <div className="mt-[2px] text-xs text-grey-500">
                        {isSyncing ? 'Wird synchronisiert…' : formatRelative(folder.lastSyncedAt)}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={disabled || isSyncing || remainingSlots <= 0}
                      onClick={() => void handleSync(folder)}
                      aria-label={`${folder.folderName} synchronisieren`}
                    >
                      {isSyncing ? (
                        <span className="size-3 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500" />
                      ) : (
                        <HiRefresh size={14} />
                      )}
                      Synchronisieren
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      disabled={disabled || isSyncing}
                      onClick={() => handleRemove(folder.shareLinkId)}
                      title="Nur die Verbindung wird entfernt — bereits importierte Dokumente bleiben im Notebook."
                      aria-label={`${folder.folderName} entfernen`}
                    >
                      <HiX size={12} />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          {error && (
            <div className="mt-xs flex items-start gap-xs rounded-md bg-amber-50 px-sm py-xs text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <HiExclamation size={14} className="mt-[1px] shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default NotebookEditorWolkeSection;
