import { type NotebookDocumentRecord, type WolkeFolderRef } from '@gruenerator/contracts';
import { checkCloudShareLink, formatRelativeTime } from '@gruenerator/shared/utils';
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  toast,
  useConfirm,
} from '@gruenerator/ui';
import { useShareLinks, wolkeKeys } from '@gruenerator/wolke';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { HiChevronRight, HiCloud, HiDotsHorizontal, HiRefresh } from 'react-icons/hi';

import { cn } from '../../../../utils/cn';
import { useSetNotebookAutoSync } from '../../hooks/usePendingWolkeFiles';
import { removeWolkeFolder, updateWolkeFolder, wolkeFolderKey } from '../../hooks/wolkeFolderRefs';
import NotebookPendingFilesPanel from '../NotebookPendingFilesPanel';

import { kindLabel, sourceStatus, SOURCE_STATUS_LABELS, type WolkeGroup } from './hubSources';
import { EmptySources } from './PanelChrome';
import { StatusDot } from './StatusDot';

import type { NotebookHubApi } from './useNotebookHub';

const SHOWN_FILES = 3;

interface WolkePanelProps {
  hub: NotebookHubApi;
  collectionId: string;
  groups: WolkeGroup[];
  folders: WolkeFolderRef[];
  autoSync: boolean;
  isOwner: boolean;
  onPreview: (doc: NotebookDocumentRecord) => void;
}

function linkProblem(value: string): string | null {
  const check = checkCloudShareLink(value.trim());
  if (check.ok) return null;
  return check.problem === 'empty'
    ? null
    : 'Das sieht nicht nach einem Nextcloud-Freigabelink aus (…/s/…).';
}

function summarize(r: {
  importedNow: number;
  alreadyImported: number;
  queued: number;
  failed: number;
  skipped: number;
}) {
  const parts: string[] = [];
  if (r.importedNow > 0) parts.push(`${r.importedNow} importiert`);
  if (r.alreadyImported > 0) parts.push(`${r.alreadyImported} schon vorhanden`);
  if (r.queued > 0) parts.push(`${r.queued} unter „Neue Dateien" vorgemerkt`);
  if (r.failed > 0) parts.push(`${r.failed} nicht lesbar`);
  if (r.skipped > 0) parts.push(`${r.skipped} übersprungen (Notebook voll)`);
  return parts.join(' · ') || 'Keine unterstützten Dateien gefunden.';
}

export function WolkePanel({
  hub,
  collectionId,
  groups,
  folders,
  autoSync,
  isOwner,
  onPreview,
}: WolkePanelProps) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const shareLinks = useShareLinks();
  const setAutoSync = useSetNotebookAutoSync(collectionId);
  const [link, setLink] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState<Set<string>>(() => new Set());
  const [errors, setErrors] = useState<Map<string, string>>(() => new Map());
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(() => new Set());

  const urlById = useMemo(
    () => new Map((shareLinks.data ?? []).map((l) => [l.id, l.share_link ?? null])),
    [shareLinks.data]
  );

  const problem = linkProblem(link);
  const token = (() => {
    const check = checkCloudShareLink(link.trim());
    return check.ok ? check.parsed.shareToken : null;
  })();
  const duplicate =
    token !== null &&
    (shareLinks.data ?? []).some(
      (l) => l.share_token === token && folders.some((f) => f.shareLinkId === l.id)
    );
  const canConnect = Boolean(link.trim()) && !problem && !duplicate && !connecting;

  const runAttach = async (
    key: string | null,
    body: Parameters<NotebookHubApi['attachWolke']>[0]
  ) => {
    if (key) {
      setSyncing((p) => new Set(p).add(key));
      setErrors((p) => {
        const next = new Map(p);
        next.delete(key);
        return next;
      });
    }
    try {
      const result = await hub.attachWolke(body);
      toast.success(`${result.folderName}: ${summarize(result)}`);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Die Wolke hat nicht geantwortet.';
      if (key) setErrors((p) => new Map(p).set(key, message));
      else toast.error(message);
      return false;
    } finally {
      if (key)
        setSyncing((p) => {
          const next = new Set(p);
          next.delete(key);
          return next;
        });
      void queryClient.invalidateQueries({ queryKey: wolkeKeys.shareLinks() });
    }
  };

  const connect = async () => {
    if (!canConnect) return;
    setConnecting(true);
    const ok = await runAttach(null, { url: link.trim(), includeSubfolders: true });
    setConnecting(false);
    if (ok) setLink('');
  };

  const patchFolder = (target: WolkeFolderRef, patch: Partial<WolkeFolderRef>) =>
    hub
      .saveMeta({
        wolke_folders: updateWolkeFolder(folders, wolkeFolderKey(target), patch),
      })
      .catch((err: unknown) =>
        toast.error(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.')
      );

  const disconnect = async (group: WolkeGroup & { folder: WolkeFolderRef }) => {
    const ok = await confirm({
      title: `„${group.folder.folderName}" trennen?`,
      description:
        group.documents.length > 0
          ? `Die ${group.documents.length} Dateien aus diesem Ordner werden aus dem Notebook entfernt. In der Wolke bleibt alles, wie es ist.`
          : 'Der Ordner wird nicht mehr synchronisiert. In der Wolke bleibt alles, wie es ist.',
      confirmLabel: 'Trennen',
    });
    if (!ok) return;
    try {
      // Dokumente zuerst: scheitert danach der Verweis, bleibt ein leerer Ordner
      // stehen statt verwaister Dateien unter „Weitere Wolke-Dateien".
      if (group.documents.length > 0) await hub.removeDocuments(group.documents.map((d) => d.id));
      await hub.saveMeta({
        wolke_folders: removeWolkeFolder(folders, wolkeFolderKey(group.folder)),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Trennen fehlgeschlagen.');
    }
  };

  const toggleIn = (set: (fn: (p: Set<string>) => Set<string>) => void, key: string) =>
    set((p) => {
      const next = new Set(p);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <section aria-label="Wolke-Ordner" className="flex flex-col gap-md">
      <div className="flex flex-col gap-xs">
        <label htmlFor="hub-wolke-link" className="text-sm font-semibold">
          Nextcloud-Ordner per Freigabelink hinzufügen
        </label>
        <div className="flex flex-wrap gap-xs">
          <Input
            id="hub-wolke-link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void connect();
            }}
            placeholder="https://wolke.netzbegruenung.de/s/…"
            aria-invalid={Boolean(problem) || duplicate}
            aria-describedby="hub-wolke-hint"
            className="h-9 min-w-0 flex-[1_1_15rem]"
          />
          <Button
            variant="brand"
            size="brand-sm"
            onClick={() => void connect()}
            disabled={!canConnect}
          >
            {connecting ? 'Wird gelesen…' : 'Hinzufügen'}
          </Button>
        </div>
        <span
          id="hub-wolke-hint"
          className={cn(
            'text-xs text-pretty',
            problem || duplicate ? 'text-red-700 dark:text-red-400' : 'text-grey-500'
          )}
        >
          {duplicate
            ? 'Dieser Ordner ist bereits im Notebook.'
            : (problem ??
              'In der Wolke: Ordner → Teilen → „Link kopieren". Die ersten Dateien werden sofort übernommen, der Rest erscheint unter „Neue Dateien".')}
        </span>
      </div>

      {isOwner && folders.length > 0 ? (
        <NotebookPendingFilesPanel
          collectionId={collectionId}
          wolkeFolders={folders}
          autoSync={autoSync}
        />
      ) : null}

      {groups.length === 0 ? (
        <EmptySources
          icon={<HiCloud aria-hidden className="size-5" />}
          title="Noch kein Wolke-Ordner"
          text="Füge oben den Freigabelink eines Nextcloud-Ordners ein."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-grey-200 text-sm @container dark:border-grey-700">
          {groups.map((group, idx) => {
            const folder = group.folder;
            const key = folder ? wolkeFolderKey(folder) : 'orphans';
            const isSyncing = syncing.has(key);
            const error = errors.get(key) ?? null;
            const open = !collapsed.has(key) && !error;
            const showAll = expandedFiles.has(key);
            const files = showAll ? group.documents : group.documents.slice(0, SHOWN_FILES);
            const statusLabel = isSyncing
              ? 'Synchronisiere…'
              : error
                ? 'Sync fehlgeschlagen'
                : folder && !folder.lastSyncedAt
                  ? 'Noch nicht synchronisiert'
                  : 'Synchron';
            const shareUrl = folder ? urlById.get(folder.shareLinkId) : null;
            const synced = folder?.lastSyncedAt ? formatRelativeTime(folder.lastSyncedAt) : 'nie';
            return (
              <div
                key={key}
                className={cn(idx > 0 && 'border-t border-grey-200 dark:border-grey-700')}
              >
                <div className="flex items-center gap-sm bg-background-alt px-md py-sm">
                  <button
                    type="button"
                    onClick={() => toggleIn(setCollapsed, key)}
                    aria-expanded={open}
                    className="flex min-w-0 flex-1 items-center gap-sm text-left"
                  >
                    <HiChevronRight
                      aria-hidden
                      className={cn(
                        'size-3.5 shrink-0 text-grey-500 transition-transform',
                        open && 'rotate-90'
                      )}
                    />
                    <span
                      aria-hidden
                      className={cn(
                        'inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-background',
                        error ? 'text-red-600' : 'text-secondary-600'
                      )}
                    >
                      <HiCloud className="size-4" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <strong className="truncate">
                        {folder ? folder.folderName : 'Weitere Wolke-Dateien'}
                      </strong>
                      <span className="truncate text-xs text-grey-500">
                        {folder
                          ? `${folder.shareLabel || 'Wolke'} · ${group.documents.length} Dateien · Sync ${synced}`
                          : `${group.documents.length} Dateien ohne verbundenen Ordner`}
                      </span>
                    </span>
                  </button>
                  {folder ? (
                    <>
                      <span
                        className={cn(
                          'inline-flex items-center gap-xs text-[13px] whitespace-nowrap',
                          error
                            ? 'text-red-700 dark:text-red-400'
                            : 'text-grey-600 dark:text-grey-300'
                        )}
                      >
                        <StatusDot status={error ? 'failed' : isSyncing ? 'indexing' : 'ready'} />
                        <span className="@max-[760px]:sr-only">{statusLabel}</span>
                      </span>
                      <Button
                        variant={error ? 'outline' : 'ghost'}
                        size="xs"
                        disabled={isSyncing}
                        onClick={() =>
                          void runAttach(key, {
                            shareLinkId: folder.shareLinkId,
                            folderPath: folder.folderPath,
                            includeSubfolders: folder.includeSubfolders ?? true,
                          })
                        }
                      >
                        <HiRefresh aria-hidden className={cn(isSyncing && 'animate-spin')} />
                        <span className="max-sm:sr-only">
                          {error ? 'Erneut versuchen' : 'Sync'}
                        </span>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Einstellungen für ${folder.folderName}`}
                          >
                            <HiDotsHorizontal aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[15rem]">
                          <DropdownMenuCheckboxItem
                            checked={folder.includeSubfolders ?? true}
                            onCheckedChange={(v) =>
                              void patchFolder(folder, { includeSubfolders: v === true })
                            }
                          >
                            Unterordner einbeziehen
                          </DropdownMenuCheckboxItem>
                          {isOwner ? (
                            <DropdownMenuCheckboxItem
                              checked={autoSync}
                              onCheckedChange={(v) => setAutoSync.mutate(v === true)}
                            >
                              Stündlich nach neuen Dateien sehen
                            </DropdownMenuCheckboxItem>
                          ) : null}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={!shareUrl}
                            onSelect={() => {
                              if (!shareUrl) return;
                              void navigator.clipboard?.writeText(shareUrl);
                              toast.success('Freigabelink kopiert');
                            }}
                          >
                            Freigabelink kopieren
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!shareUrl}
                            onSelect={() => shareUrl && window.open(shareUrl, '_blank', 'noopener')}
                          >
                            In Wolke öffnen ↗
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => void disconnect({ ...group, folder })}
                          >
                            Verbindung trennen
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  ) : null}
                </div>

                {error ? (
                  <div
                    role="alert"
                    className="border-t border-grey-200 bg-red-600/5 px-md py-xs pl-[3.625rem] text-[13px] text-pretty text-red-700 dark:border-grey-700 dark:text-red-400"
                  >
                    {error} Prüfe, ob der Freigabelink noch gültig ist, und versuche es erneut.
                  </div>
                ) : null}

                {open ? (
                  <>
                    {files.map((doc) => {
                      const status = sourceStatus(doc);
                      return (
                        <div
                          key={doc.id}
                          className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-sm border-t border-grey-200 px-md py-[0.5625rem] @min-[760px]:grid-cols-[1.75rem_minmax(0,1fr)_8.75rem_8.75rem] @min-[760px]:pl-[3.625rem] dark:border-grey-700"
                        >
                          <span
                            aria-hidden
                            className="inline-flex size-7 items-center justify-center rounded-md bg-secondary-600/15 text-[8px] font-bold text-secondary-700 dark:text-secondary-300"
                          >
                            {kindLabel(doc)}
                          </span>
                          <span className="flex min-w-0 flex-col">
                            <button
                              type="button"
                              onClick={() => onPreview(doc)}
                              className="truncate text-left hover:underline"
                            >
                              {doc.title}
                            </button>
                            <span className="text-xs text-grey-500 @min-[760px]:hidden">
                              {formatRelativeTime(doc.created_at)} · {SOURCE_STATUS_LABELS[status]}
                            </span>
                          </span>
                          <span className="hidden text-grey-500 @min-[760px]:block">
                            {formatRelativeTime(doc.created_at)}
                          </span>
                          <span className="hidden items-center gap-xs @min-[760px]:inline-flex">
                            <StatusDot status={status} />
                            {SOURCE_STATUS_LABELS[status]}
                          </span>
                        </div>
                      );
                    })}
                    {group.documents.length > SHOWN_FILES ? (
                      <div className="border-t border-grey-200 px-md py-[0.5625rem] text-[13px] @min-[760px]:pl-[3.625rem] dark:border-grey-700">
                        <button
                          type="button"
                          onClick={() => toggleIn(setExpandedFiles, key)}
                          className="text-secondary-700 dark:text-secondary-300"
                        >
                          {showAll
                            ? 'Weniger anzeigen'
                            : `+ ${group.documents.length - SHOWN_FILES} weitere Dateien anzeigen`}
                        </button>
                      </div>
                    ) : null}
                    {group.documents.length === 0 ? (
                      <div className="border-t border-grey-200 px-md py-sm text-[13px] text-grey-500 @min-[760px]:pl-[3.625rem] dark:border-grey-700">
                        {isSyncing
                          ? 'Dateien werden gelesen…'
                          : 'Noch keine Dateien – synchronisiere den Ordner.'}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
