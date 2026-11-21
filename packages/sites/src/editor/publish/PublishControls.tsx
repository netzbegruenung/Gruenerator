import { type SitePublishIssue } from '@gruenerator/contracts';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@gruenerator/ui';
import { type HocuspocusProvider } from '@hocuspocus/provider';
import { useRef, useState } from 'react';
import { FiMoreVertical } from 'react-icons/fi';

import { useDraft } from '../../draft/SiteDraftContext';
import { settleLegalSave } from '../../hooks/legalSaveGate';
import { SitePublishError, useSite, type SiteData } from '../../hooks/useSite';
import { useToast } from '../../hooks/useToast';
import { blockIdForPath } from '../../preview/fieldPaths';
import { useAuth } from '../../SitesContext';
import { useEditorStore } from '../../stores/editorStore';
import { SitesApiError } from '../../utils/errorHandler';

import { ConfirmAlert, DeleteSiteDialog } from './DeleteSiteDialog';
import { PublishIssues } from './PublishIssues';
import { publishState, type PublishStatus } from './publishState';
import { waitForSynced } from './waitForSynced';

export const PUBLISH_SYNC_TIMEOUT_MS = 5000;

// 'changed' has no badge: the "Änderungen veröffentlichen" button already says so.
const BADGE_LABELS: Record<Exclude<PublishStatus, 'changed'>, string> = {
  unpublished: 'Nicht veröffentlicht',
  live: 'Live',
};

const NOT_SAVED_MESSAGE =
  'Noch nicht alles gespeichert. Prüfe deine Verbindung und versuche es noch einmal.';

interface PublishControlsProps {
  site: SiteData;
  provider: Pick<HocuspocusProvider, 'unsyncedChanges' | 'on' | 'off'>;
}

export function PublishControls({ site, provider }: PublishControlsProps) {
  const { user } = useAuth();
  const toast = useToast();
  const { togglePublish, deleteSite, publicOrigin } = useSite();
  const focusPath = useEditorStore((s) => s.focusPath);
  const draft = useDraft((d) => d);
  const { status, issues } = publishState({ draft, site, locale: user?.locale ?? 'de-DE' });

  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const publishErrorId = useRef<string | number | null>(null);
  const pickedIssue = useRef(false);
  const [serverIssues, setServerIssues] = useState<SitePublishIssue[] | null>(null);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const shownIssues = serverIssues ?? issues;

  const publish = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setServerIssues(null);
    try {
      const legal = await settleLegalSave(site.id);
      if (!legal.ok) {
        toast.error('Impressum nicht gespeichert', NOT_SAVED_MESSAGE);
        return;
      }
      // A pending Impressum save makes the local issue list stale; the server decides then.
      if (!legal.pending && issues.length > 0) {
        setIssuesOpen(true);
        return;
      }
      try {
        await waitForSynced(provider, PUBLISH_SYNC_TIMEOUT_MS);
      } catch {
        toast.error(NOT_SAVED_MESSAGE);
        return;
      }
      await togglePublish({ id: site.id, publish: true });
      if (publishErrorId.current !== null) toast.remove(publishErrorId.current);
      publishErrorId.current = null;
      toast.success('Website veröffentlicht');
    } catch (error) {
      if (error instanceof SitePublishError) {
        setServerIssues(error.issues);
        setIssuesOpen(true);
      } else if (error instanceof SitesApiError && error.status === 503) {
        publishErrorId.current = toast.error('Veröffentlichen gerade nicht möglich', error.message);
      } else {
        toast.error('Veröffentlichen fehlgeschlagen');
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const unpublish = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await togglePublish({ id: site.id, publish: false });
      toast.success('Veröffentlichung zurückgezogen');
    } catch {
      toast.error('Zurückziehen fehlgeschlagen');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await deleteSite(site.id);
      toast.success('Website gelöscht', 'Sie liegt 30 Tage im Papierkorb.');
    } catch {
      toast.error('Löschen fehlgeschlagen');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const pickIssue = (path: string) => {
    pickedIssue.current = true;
    focusPath(blockIdForPath(path, draft) ?? 'legal', path);
    setIssuesOpen(false);
  };

  const liveUrl = site.is_published && publicOrigin ? `${publicOrigin}/${site.subdomain}` : null;

  return (
    <>
      {status !== 'changed' && (
        // The publish button names the state too; on a phone the header has no room for both.
        <Badge variant={status === 'live' ? 'default' : 'secondary'} className="max-sm:hidden">
          {BADGE_LABELS[status]}
        </Badge>
      )}
      <Popover open={issuesOpen} onOpenChange={setIssuesOpen}>
        <PopoverAnchor asChild>
          <Button
            ref={triggerRef}
            onClick={() => void publish()}
            disabled={status === 'live' || busy}
          >
            {status === 'live'
              ? 'Veröffentlicht'
              : status === 'changed'
                ? 'Änderungen veröffentlichen'
                : 'Veröffentlichen'}
          </Button>
        </PopoverAnchor>
        <PopoverContent
          align="end"
          className="w-80"
          aria-labelledby="publish-issues-title"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            // After picking an issue the target field owns the focus, not the trigger.
            if (pickedIssue.current) pickedIssue.current = false;
            else triggerRef.current?.focus();
          }}
        >
          <PublishIssues issues={shownIssues} draft={draft} onPick={pickIssue} />
        </PopoverContent>
      </Popover>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={menuRef} variant="outline" aria-label="Weitere Aktionen">
            <FiMoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {liveUrl && (
            <DropdownMenuItem onSelect={() => window.open(liveUrl, '_blank', 'noopener')}>
              Live-Seite öffnen
            </DropdownMenuItem>
          )}
          {site.is_published && (
            <DropdownMenuItem onSelect={() => setUnpublishOpen(true)}>
              Veröffentlichung zurückziehen
            </DropdownMenuItem>
          )}
          {site.is_published && <DropdownMenuSeparator />}
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
            Website löschen
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmAlert
        open={unpublishOpen}
        onOpenChange={setUnpublishOpen}
        title="Veröffentlichung zurückziehen?"
        description="Die Website ist dann nicht mehr öffentlich erreichbar. Dein Entwurf bleibt erhalten."
        confirmLabel="Zurückziehen"
        variant="default"
        returnFocusRef={menuRef}
        onConfirm={() => void unpublish()}
      />
      <DeleteSiteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={() => void remove()}
        returnFocusRef={menuRef}
      />
    </>
  );
}
