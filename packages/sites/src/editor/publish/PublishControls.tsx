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
import { useState } from 'react';
import { FiMoreVertical } from 'react-icons/fi';

import { useDraft } from '../../draft/SiteDraftContext';
import { settleLegalSave } from '../../hooks/legalSaveGate';
import { SitePublishError, useSite, type SiteData } from '../../hooks/useSite';
import { useToast } from '../../hooks/useToast';
import { panelForPath } from '../../preview/fieldPaths';
import { useAuth } from '../../SitesContext';
import { useEditorStore } from '../../stores/editorStore';
import { SitesApiError } from '../../utils/errorHandler';

import { ConfirmAlert, DeleteSiteDialog } from './DeleteSiteDialog';
import { PublishIssues } from './PublishIssues';
import { publishState, type PublishStatus } from './publishState';
import { waitForSynced } from './waitForSynced';

export const PUBLISH_SYNC_TIMEOUT_MS = 5000;

const BADGE_LABELS: Record<PublishStatus, string> = {
  unpublished: 'Nicht veröffentlicht',
  live: 'Live',
  changed: 'Änderungen nicht veröffentlicht',
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
  const [serverIssues, setServerIssues] = useState<SitePublishIssue[] | null>(null);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const shownIssues = serverIssues ?? issues;

  const publish = async () => {
    if (busy) return;
    setBusy(true);
    setServerIssues(null);
    try {
      const legal = await settleLegalSave();
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
      toast.success('Website veröffentlicht');
    } catch (error) {
      if (error instanceof SitePublishError) {
        setServerIssues(error.issues);
        setIssuesOpen(true);
      } else if (error instanceof SitesApiError && error.status === 503) {
        toast.error('Veröffentlichen gerade nicht möglich', error.message);
      } else {
        toast.error('Veröffentlichen fehlgeschlagen');
      }
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async () => {
    try {
      await togglePublish({ id: site.id, publish: false });
      toast.success('Veröffentlichung zurückgezogen');
    } catch {
      toast.error('Zurückziehen fehlgeschlagen');
    }
  };

  const remove = async () => {
    try {
      await deleteSite(site.id);
    } catch {
      toast.error('Löschen fehlgeschlagen');
    }
  };

  const pickIssue = (path: string) => {
    focusPath(panelForPath(path) ?? 'legal', path);
    setIssuesOpen(false);
  };

  const liveUrl = site.is_published && publicOrigin ? `${publicOrigin}/${site.subdomain}` : null;

  return (
    <>
      <Badge variant={status === 'live' ? 'default' : 'secondary'}>{BADGE_LABELS[status]}</Badge>
      <Popover open={issuesOpen} onOpenChange={setIssuesOpen}>
        <PopoverAnchor asChild>
          <Button onClick={() => void publish()} disabled={status === 'live' || busy}>
            {status === 'live'
              ? 'Veröffentlicht'
              : status === 'changed'
                ? 'Änderungen veröffentlichen'
                : 'Veröffentlichen'}
          </Button>
        </PopoverAnchor>
        <PopoverContent align="end" className="w-80">
          <PublishIssues issues={shownIssues} onPick={pickIssue} />
        </PopoverContent>
      </Popover>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" aria-label="Weitere Aktionen">
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
        onConfirm={() => void unpublish()}
      />
      <DeleteSiteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={() => void remove()}
      />
    </>
  );
}
