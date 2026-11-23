import {
  useAttachGroupWolkeFolder,
  useDetachGroupWolkeFolder,
  useGroupWolkeFolders,
  useSyncGroupWolkeFolder,
  wolkeSyncSummaryText,
} from '@gruenerator/shared/groups';
import { checkCloudShareLink, formatRelativeTime } from '@gruenerator/shared/utils';
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  useConfirm,
} from '@gruenerator/ui';
import { useState } from 'react';
import { PiCloud, PiDotsThreeVertical, PiPlus } from 'react-icons/pi';

interface ProjectWolkeFoldersCardProps {
  groupId: string;
  isAdmin: boolean;
  /** Archivierte Projekte nehmen nichts Neues an; der Abgleich ruht. */
  archived: boolean;
  onSuccessMessage?: (msg: string) => void;
  onErrorMessage?: (msg: string) => void;
}

function linkProblem(value: string): string | null {
  const check = checkCloudShareLink(value.trim());
  if (check.ok || check.problem === 'empty') return null;
  return 'Das sieht nicht nach einem Nextcloud-Freigabelink aus (…/s/…).';
}

/**
 * „Wolke-Ordner" (experimentell, #5945): ein Nextcloud-Ordner, dessen Dateien
 * als Projektwissen eingelesen und stündlich abgeglichen werden. Die Dateien
 * selbst stehen im „Wissen"; hier steht nur, welche Ordner dahinter hängen.
 * Mitglieder sehen die Ordner, Admins hängen an, gleichen ab und trennen.
 */
export function ProjectWolkeFoldersCard({
  groupId,
  isAdmin,
  archived,
  onSuccessMessage,
  onErrorMessage,
}: ProjectWolkeFoldersCardProps) {
  const { data: folders = [] } = useGroupWolkeFolders(groupId);
  const attach = useAttachGroupWolkeFolder(groupId);
  const sync = useSyncGroupWolkeFolder(groupId);
  const detach = useDetachGroupWolkeFolder(groupId);
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState('');
  const [name, setName] = useState('');
  const [includeSubfolders, setIncludeSubfolders] = useState(true);

  const canEdit = isAdmin && !archived;
  if (folders.length === 0 && !canEdit) return null;

  const problem = linkProblem(link);
  const canSubmit = link.trim().length > 0 && !problem && !attach.isPending;

  const submit = () => {
    if (!canSubmit) return;
    attach.mutate(
      { url: link.trim(), includeSubfolders, ...(name.trim() ? { name: name.trim() } : {}) },
      {
        onSuccess: (result) => {
          setOpen(false);
          setLink('');
          setName('');
          if (result.folder.lastError) onErrorMessage?.(result.folder.lastError);
          else
            onSuccessMessage?.(`Wolke-Ordner verbunden: ${wolkeSyncSummaryText(result.summary)}`);
        },
        onError: (error: Error) => onErrorMessage?.(error.message),
      }
    );
  };

  const syncNow = (folderId: string) =>
    sync.mutate(folderId, {
      onSuccess: (result) =>
        result.folder.lastError
          ? onErrorMessage?.(result.folder.lastError)
          : onSuccessMessage?.(wolkeSyncSummaryText(result.summary)),
      onError: (error: Error) => onErrorMessage?.(error.message),
    });

  const disconnect = async (folderId: string, name: string, fileCount: number) => {
    const ok = await confirm({
      title: `„${name}" trennen?`,
      description:
        fileCount > 0
          ? `${fileCount === 1 ? 'Die Datei' : `Die ${fileCount} Dateien`} aus diesem Ordner ${fileCount === 1 ? 'verlässt' : 'verlassen'} das Projekt. In der Wolke bleibt alles, wie es ist.`
          : 'Der Ordner wird nicht mehr abgeglichen. In der Wolke bleibt alles, wie es ist.',
      confirmLabel: 'Trennen',
    });
    if (!ok) return;
    detach.mutate(folderId, {
      onSuccess: () => onSuccessMessage?.('Wolke-Ordner getrennt.'),
      onError: (error: Error) => onErrorMessage?.(error.message),
    });
  };

  return (
    <>
      <section
        aria-labelledby="projekt-wolke-titel"
        className="flex flex-col gap-xs rounded-[20px] bg-card px-md py-sm shadow-sm"
      >
        <div className="flex items-center gap-sm">
          <PiCloud aria-hidden className="size-5 shrink-0 text-primary-600 dark:text-primary-400" />
          <h2
            id="projekt-wolke-titel"
            className="m-0 shrink-0 whitespace-nowrap text-[15px] font-semibold"
          >
            Wolke-Ordner
          </h2>
          <Badge variant="outline">Experimentell</Badge>
          <span className="flex-1" />
          {canEdit && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border-none bg-transparent px-2 py-1 font-[inherit] text-sm font-medium text-primary-600 hover:bg-muted dark:text-primary-400"
            >
              <PiPlus aria-hidden className="size-4" />
              Ordner
            </button>
          )}
        </div>
        {archived && folders.length > 0 && (
          <p className="m-0 text-xs text-muted-foreground">
            Pausiert, solange das Projekt archiviert ist.
          </p>
        )}
        {folders.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">
            Verbinde einen Nextcloud-Ordner: seine Dateien landen im Wissen und bleiben aktuell.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-xs p-0">
            {folders.map((folder) => {
              const syncing = sync.isPending && sync.variables === folder.id;
              return (
                <li key={folder.id} className="flex items-start gap-xs">
                  <div className="flex min-w-0 flex-1 flex-col px-1 py-1">
                    <span className="truncate text-sm font-medium">{folder.folderName}</span>
                    <span
                      className={
                        folder.lastError
                          ? 'text-xs text-pretty text-red-700 dark:text-red-400'
                          : 'truncate text-xs text-muted-foreground'
                      }
                    >
                      {syncing
                        ? 'Wird abgeglichen …'
                        : (folder.lastError ??
                          [
                            `${folder.fileCount} ${folder.fileCount === 1 ? 'Datei' : 'Dateien'}`,
                            folder.pendingCount > 0 ? `${folder.pendingCount} folgen` : null,
                            folder.lastSyncedAt
                              ? `abgeglichen ${formatRelativeTime(folder.lastSyncedAt)}`
                              : 'noch nicht abgeglichen',
                          ]
                            .filter(Boolean)
                            .join(' · '))}
                    </span>
                    {folder.attachedByName && (
                      <span className="truncate text-xs text-muted-foreground">
                        über die Wolke von {folder.attachedByName}
                      </span>
                    )}
                  </div>
                  {isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="rounded-full"
                          aria-label={`Aktionen für ${folder.folderName}`}
                        >
                          <PiDotsThreeVertical aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!archived && (
                          <DropdownMenuItem disabled={syncing} onSelect={() => syncNow(folder.id)}>
                            Jetzt abgleichen
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onSelect={() =>
                            void disconnect(folder.id, folder.folderName, folder.fileCount)
                          }
                        >
                          Trennen
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[30rem]">
          <DialogHeader>
            <DialogTitle>Wolke-Ordner verbinden</DialogTitle>
            <DialogDescription>
              Die Dateien des Ordners werden als Projektwissen eingelesen und stündlich abgeglichen:
              Neue kommen dazu, gelöschte verschwinden aus dem Projekt. Gelesen wird mit deinem
              Freigabelink.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-xs">
            <label htmlFor="projekt-wolke-link" className="text-sm font-semibold">
              Freigabelink des Ordners
            </label>
            <Input
              id="projekt-wolke-link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              placeholder="https://wolke.netzbegruenung.de/s/…"
              aria-invalid={Boolean(problem)}
              aria-describedby="projekt-wolke-hint"
              disabled={attach.isPending}
            />
            <span
              id="projekt-wolke-hint"
              className={
                problem
                  ? 'text-xs text-pretty text-red-700 dark:text-red-400'
                  : 'text-xs text-pretty text-muted-foreground'
              }
            >
              {problem ??
                'In der Wolke: Ordner → Teilen → „Link kopieren". Höchstens 200 Dateien je Ordner; große Ordner kommen über mehrere Abgleiche herein.'}
            </span>
            <label htmlFor="projekt-wolke-name" className="mt-xs text-sm font-semibold">
              Name im Projekt <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="projekt-wolke-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="z. B. Protokolle Ortsverband"
              disabled={attach.isPending}
            />
            <label className="mt-xs flex items-center gap-xs text-sm">
              <Checkbox
                checked={includeSubfolders}
                onCheckedChange={(v) => setIncludeSubfolders(v === true)}
                disabled={attach.isPending}
              />
              Unterordner einbeziehen
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={attach.isPending}>
              Abbrechen
            </Button>
            <Button variant="brand" onClick={submit} disabled={!canSubmit}>
              {attach.isPending ? 'Wird eingelesen …' : 'Verbinden'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
