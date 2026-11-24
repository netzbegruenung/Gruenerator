import { type GroupCloudSource } from '@gruenerator/contracts';
import { apiErrorFromResponse, getContractsClient } from '@gruenerator/shared/api';
import {
  cloudSourceStatusParts,
  cloudSyncSummaryText,
  detachCloudSourceDescription,
  useAttachGroupDriveFiles,
  useAttachGroupWolkeFolder,
  useDetachGroupCloudSource,
  useGroupCloudSources,
  useSyncGroupCloudSource,
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
  toast,
  useConfirm,
} from '@gruenerator/ui';
import { useState } from 'react';
import { PiCloud, PiDotsThreeVertical, PiGoogleDriveLogo, PiPlus } from 'react-icons/pi';

interface ProjectCloudSourcesCardProps {
  groupId: string;
  isAdmin: boolean;
  /** Archivierte Projekte nehmen nichts Neues an; der Abgleich ruht. */
  archived: boolean;
}

// Rückmeldung als Toast wie im Notebook-Wolke-Bereich: das Status-Banner der
// Projektseite steht oben, die Karte ganz unten in der rechten Spalte.
const onSuccessMessage = (message: string) => toast.success(message);
const onErrorMessage = (message: string) => toast.error(message);

function linkProblem(value: string): string | null {
  const check = checkCloudShareLink(value.trim());
  if (check.ok || check.problem === 'empty') return null;
  return 'Das sieht nicht nach einem Nextcloud-Freigabelink aus (…/s/…).';
}

const PROVIDER_ICON: Record<GroupCloudSource['provider'], typeof PiCloud> = {
  wolke: PiCloud,
  'google-drive': PiGoogleDriveLogo,
};

/** Öffnet den Google Picker mit dem Konto der Person; `[]` bei Abbruch. */
async function pickDriveFiles() {
  const res = await getContractsClient().connections.googlePicker();
  if (res.status !== 200) {
    throw apiErrorFromResponse(
      res,
      'Verbinde zuerst Google Drive in den Einstellungen unter Konnektoren.'
    );
  }
  // Nur hier gebraucht und nur im Browser: erst beim Klick laden.
  const { pickGoogleFiles } = await import('@gruenerator/chat/lib/googlePicker');
  return pickGoogleFiles(res.body);
}

/**
 * „Wolke & Drive" (experimentell, #5945): Quellen, deren Dateien als
 * Projektwissen eingelesen und stündlich abgeglichen werden — ein
 * Nextcloud-Ordner oder im Google Picker gewählte Drive-Dateien. Die Dateien
 * selbst stehen im „Wissen"; hier steht, welche Quellen dahinter hängen.
 * Mitglieder sehen die Quellen, Admins fügen hinzu, gleichen ab und trennen.
 */
export function ProjectCloudSourcesCard({
  groupId,
  isAdmin,
  archived,
}: ProjectCloudSourcesCardProps) {
  const { data: sources = [] } = useGroupCloudSources(groupId);
  const attachWolke = useAttachGroupWolkeFolder(groupId);
  const attachDrive = useAttachGroupDriveFiles(groupId);
  const sync = useSyncGroupCloudSource(groupId);
  const detach = useDetachGroupCloudSource(groupId);
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState('');
  const [name, setName] = useState('');
  const [includeSubfolders, setIncludeSubfolders] = useState(true);
  const [picking, setPicking] = useState(false);

  const canEdit = isAdmin && !archived;
  if (sources.length === 0 && !canEdit) return null;

  const problem = linkProblem(link);
  const canSubmit = link.trim().length > 0 && !problem && !attachWolke.isPending;

  const report = (
    result: { source: GroupCloudSource; summary: Parameters<typeof cloudSyncSummaryText>[0] },
    prefix: string
  ) => {
    if (result.source.lastError) onErrorMessage(result.source.lastError);
    else onSuccessMessage(`${prefix}${cloudSyncSummaryText(result.summary)}`);
  };

  const submitWolke = () => {
    if (!canSubmit) return;
    attachWolke.mutate(
      { url: link.trim(), includeSubfolders, ...(name.trim() ? { name: name.trim() } : {}) },
      {
        onSuccess: (result) => {
          setOpen(false);
          setLink('');
          setName('');
          report(result, 'Wolke-Ordner verbunden: ');
        },
        onError: (error: Error) => onErrorMessage(error.message),
      }
    );
  };

  const addDriveFiles = async () => {
    setPicking(true);
    try {
      const files = await pickDriveFiles();
      if (files.length === 0) return;
      const result = await attachDrive.mutateAsync({ files });
      report(result, 'Drive-Dateien hinzugefügt: ');
    } catch (error) {
      onErrorMessage(error instanceof Error ? error.message : 'Google Drive ist nicht erreichbar.');
    } finally {
      setPicking(false);
    }
  };

  const syncNow = (sourceId: string) =>
    sync.mutate(sourceId, {
      onSuccess: (result) => report(result, ''),
      onError: (error: Error) => onErrorMessage(error.message),
    });

  const disconnect = async (source: GroupCloudSource) => {
    const ok = await confirm({
      title: `„${source.name}" trennen?`,
      description: detachCloudSourceDescription(source),
      confirmLabel: 'Trennen',
    });
    if (!ok) return;
    detach.mutate(source.id, {
      onSuccess: () => onSuccessMessage('Quelle getrennt.'),
      onError: (error: Error) => onErrorMessage(error.message),
    });
  };

  const busy = picking || attachDrive.isPending;

  return (
    <>
      <section
        aria-labelledby="projekt-ablagen-titel"
        className="flex flex-col gap-xs rounded-[20px] bg-card px-md py-sm shadow-sm"
      >
        <div className="flex items-center gap-sm">
          <PiCloud aria-hidden className="size-5 shrink-0 text-primary-600 dark:text-primary-400" />
          <h2
            id="projekt-ablagen-titel"
            className="m-0 shrink-0 whitespace-nowrap text-[15px] font-semibold"
          >
            Wolke & Drive
          </h2>
          <Badge variant="outline">Experimentell</Badge>
          <span className="flex-1" />
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={busy}
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border-none bg-transparent px-2 py-1 font-[inherit] text-sm font-medium text-primary-600 hover:bg-muted disabled:cursor-default disabled:opacity-60 dark:text-primary-400"
                >
                  <PiPlus aria-hidden className="size-4" />
                  {busy ? 'Wird eingelesen …' : 'Quelle'}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setOpen(true)}>
                  <PiCloud aria-hidden className="mr-xs size-4" />
                  Wolke-Ordner …
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void addDriveFiles()}>
                  <PiGoogleDriveLogo aria-hidden className="mr-xs size-4" />
                  Dateien aus Google Drive …
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {archived && sources.length > 0 && (
          <p className="m-0 text-xs text-muted-foreground">
            Pausiert, solange das Projekt archiviert ist.
          </p>
        )}
        {sources.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">
            Verbinde einen Nextcloud-Ordner oder Dateien aus Google Drive: sie landen im Wissen und
            bleiben aktuell.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-xs p-0">
            {sources.map((source) => {
              const syncing = sync.isPending && sync.variables === source.id;
              const Icon = PROVIDER_ICON[source.provider];
              return (
                <li key={source.id} className="flex items-start gap-xs">
                  <Icon aria-hidden className="mt-1.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-1 flex-col py-1">
                    <span className="truncate text-sm font-medium">{source.name}</span>
                    <span
                      className={
                        source.lastError && !syncing
                          ? 'text-xs text-pretty text-red-700 dark:text-red-400'
                          : 'truncate text-xs text-muted-foreground'
                      }
                    >
                      {syncing
                        ? 'Wird abgeglichen …'
                        : cloudSourceStatusParts(source, (iso) => formatRelativeTime(iso))}
                    </span>
                    {source.attachedByName && (
                      <span className="truncate text-xs text-muted-foreground">
                        {source.provider === 'wolke' ? 'über die Wolke' : 'über das Google Drive'}{' '}
                        von {source.attachedByName}
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
                          aria-label={`Aktionen für ${source.name}`}
                        >
                          <PiDotsThreeVertical aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!archived && (
                          <DropdownMenuItem disabled={syncing} onSelect={() => syncNow(source.id)}>
                            Jetzt abgleichen
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onSelect={() => void disconnect(source)}>
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
                if (e.key === 'Enter') submitWolke();
              }}
              placeholder="https://wolke.netzbegruenung.de/s/…"
              aria-invalid={Boolean(problem)}
              aria-describedby="projekt-wolke-hint"
              disabled={attachWolke.isPending}
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
              disabled={attachWolke.isPending}
            />
            <label className="mt-xs flex items-center gap-xs text-sm">
              <Checkbox
                checked={includeSubfolders}
                onCheckedChange={(v) => setIncludeSubfolders(v === true)}
                disabled={attachWolke.isPending}
              />
              Unterordner einbeziehen
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={attachWolke.isPending}
            >
              Abbrechen
            </Button>
            <Button variant="brand" onClick={submitWolke} disabled={!canSubmit}>
              {attachWolke.isPending ? 'Wird eingelesen …' : 'Verbinden'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
