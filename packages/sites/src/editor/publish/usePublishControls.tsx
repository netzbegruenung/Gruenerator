import { type SitePublishIssue } from '@gruenerator/contracts';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@gruenerator/ui';
import { type HocuspocusProvider } from '@hocuspocus/provider';
import { useRef, useState, type ReactNode } from 'react';
import { FiChevronDown } from 'react-icons/fi';

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

// Heads the site menu: the bar itself carries no status badge.
const STATUS_LABELS: Record<PublishStatus, string> = {
  unpublished: 'Nicht veröffentlicht',
  live: 'Live · aktuell',
  changed: 'Live · Entwurf hat Änderungen',
};

const NOT_SAVED_MESSAGE =
  'Noch nicht alles gespeichert. Prüfe deine Verbindung und versuche es noch einmal.';

interface PublishControlsProps {
  site: SiteData;
  provider: Pick<HocuspocusProvider, 'unsyncedChanges' | 'on' | 'off'>;
  /** Shows the published state in the canvas; offered once there is one. */
  onShowLive?: () => void;
}

/**
 * Publishing, split for the top bar: `menu` is the site name with everything about the site
 * (status, live page, unpublish, delete), `button` the one publish action. One state behind
 * both, so an unpublish cannot start while a publish is running.
 */
export function usePublishControls({ site, provider, onShowLive }: PublishControlsProps): {
  menu: ReactNode;
  button: ReactNode;
} {
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

  const siteName = draft.site_title.trim() || 'Website';

  const button = (
    <Popover open={issuesOpen} onOpenChange={setIssuesOpen}>
      <PopoverAnchor asChild>
        <Button
          ref={triggerRef}
          size="sm"
          variant={status === 'live' ? 'ghost' : 'default'}
          onClick={() => void publish()}
          disabled={status === 'live' || busy}
          className={status === 'live' ? 'font-normal text-grey-600 dark:text-grey-400' : undefined}
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
  );

  const menu = (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={menuRef} variant="ghost" size="sm" className="min-w-0 font-semibold">
            <span className="truncate">{siteName}</span>
            <FiChevronDown className="text-grey-500" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-64">
          <DropdownMenuLabel className="font-normal">
            <span className="block font-semibold">{STATUS_LABELS[status]}</span>
            {publicOrigin && (
              <span className="block text-xs text-grey-600 dark:text-grey-400">
                {`${publicOrigin.replace(/^https?:\/\//, '')}/${site.subdomain}`}
              </span>
            )}
          </DropdownMenuLabel>
          {liveUrl && (
            <DropdownMenuItem onSelect={() => window.open(liveUrl, '_blank', 'noopener')}>
              Live-Seite öffnen
            </DropdownMenuItem>
          )}
          {onShowLive && site.published_snapshot && (
            <DropdownMenuItem onSelect={onShowLive}>Live-Stand ansehen</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {site.is_published && (
            <DropdownMenuItem onSelect={() => setUnpublishOpen(true)}>
              Veröffentlichung zurückziehen
            </DropdownMenuItem>
          )}
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

  return { menu, button };
}
