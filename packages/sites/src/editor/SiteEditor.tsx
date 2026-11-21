import {
  buildSitePreviewSnapshot,
  siteDraftToSnapshotSource,
  type SupportedLocale,
} from '@gruenerator/contracts';
import { ToggleGroup, ToggleGroupItem } from '@gruenerator/ui';
import { useEffect, useMemo, useRef, useState } from 'react';

import { LoadErrorState } from '../components/common/LoadErrorState';
import { SiteDraftProvider, useDraft } from '../draft/SiteDraftContext';
import { useSiteDraftSession } from '../draft/useSiteDraftSession';
import { useLeaveWarning } from '../hooks/useLeaveWarning';
import { type SiteData } from '../hooks/useSite';
import { SITE_EDIT_SLOTS } from '../inline/editSlots';
import { SitePreviewFrame } from '../preview/SitePreviewFrame';
import { usePreviewHighlight, usePreviewSelection } from '../preview/usePreviewInteractions';
import { useAuth } from '../SitesContext';
import { useEditorStore } from '../stores/editorStore';

import { CanvasToolbar } from './canvas/CanvasToolbar';
import { ElementPanel } from './canvas/ElementPanel';
import { useAnchorRect } from './canvas/useAnchorRect';
import { EditorDialogs } from './EditorDialogs';
import { EditorHeader } from './EditorHeader';
import { EditorSkeleton } from './EditorSkeleton';
import { PreviewDialog } from './PreviewDialog';
import { PublishControls } from './publish/PublishControls';

function DraftPreview({ site, editable }: { site: SiteData; editable: boolean }) {
  const { user } = useAuth();
  const locale: SupportedLocale = user?.locale ?? 'de-DE';
  const draft = useDraft((d) => d);
  const [frameDoc, setFrameDoc] = useState<Document | null>(null);
  // The editable canvas keeps hidden blocks (marked), so they can be selected and shown again.
  const snapshot = useMemo(
    () =>
      buildSitePreviewSnapshot(siteDraftToSnapshotSource(draft, site.legal), locale, {
        includeHidden: editable,
      }),
    [draft, site.legal, locale, editable]
  );
  return (
    <div className="relative h-full w-full">
      {editable && <PreviewInteractions doc={frameDoc} />}
      <SitePreviewFrame
        snapshot={snapshot}
        handle={site.subdomain}
        title="Vorschau der Website"
        className="block h-full w-full border-0"
        editable={editable}
        edit={editable ? SITE_EDIT_SLOTS : undefined}
        onFrameDocument={setFrameDoc}
      />
      {editable && <CanvasOverlay doc={frameDoc} />}
    </div>
  );
}

/** Toolbar and panel over the page, for whatever is selected in it. */
function CanvasOverlay({ doc }: { doc: Document | null }) {
  const selection = useEditorStore((s) => s.selection);
  const anchor = useAnchorRect(doc, selection);
  if (!selection) return null;
  return (
    <>
      {anchor && (
        <CanvasToolbar
          selection={selection}
          anchor={anchor}
          canvasWidth={doc?.defaultView?.innerWidth ?? 0}
          canvasHeight={doc?.defaultView?.innerHeight ?? 0}
        />
      )}
      <ElementPanel selection={selection} />
    </>
  );
}

type PreviewView = 'draft' | 'live';

export function PreviewPane({ site }: { site: SiteData }) {
  const [view, setView] = useState<PreviewView>('draft');
  const published = site.published_snapshot;
  const showLive = view === 'live' && published !== null;
  return (
    <div className="flex h-full flex-col">
      {published && (
        <div className="flex shrink-0 justify-center border-b border-grey-200 p-xs dark:border-grey-700">
          <ToggleGroup
            type="single"
            variant="outline"
            value={view}
            onValueChange={(value) => {
              if (value) setView(value as PreviewView);
            }}
            aria-label="Vorschau-Stand"
          >
            <ToggleGroupItem value="draft">Entwurf</ToggleGroupItem>
            <ToggleGroupItem value="live">Live-Stand</ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}
      <div className="min-h-0 flex-1">
        {showLive ? (
          <SitePreviewFrame
            snapshot={published}
            handle={site.subdomain}
            title="Live-Stand der Website"
            className="block h-full w-full border-0"
          />
        ) : (
          <DraftPreview site={site} editable />
        )}
      </div>
    </div>
  );
}

function PreviewInteractions({ doc }: { doc: Document | null }) {
  usePreviewSelection(doc);
  usePreviewHighlight(doc);
  return null;
}

export function SiteEditor({ site, onBack }: { site: SiteData; onBack?: () => void }) {
  const session = useSiteDraftSession(site.id);
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewButtonRef = useRef<HTMLButtonElement>(null);
  useLeaveWarning(session.state === 'ready' && session.save !== 'saved');
  // The editor store is module state: leave no selection or open dialog behind for the next visit.
  useEffect(
    () => () => useEditorStore.setState({ selection: null, elementPanel: null, dialog: null }),
    []
  );

  switch (session.state) {
    case 'preparing':
    case 'connecting':
      return <EditorSkeleton label="Entwurf wird geöffnet" />;
    case 'unavailable':
      return (
        <LoadErrorState title="Der Entwurf ist gerade nicht erreichbar" onRetry={session.retry} />
      );
    case 'error':
      return <LoadErrorState onRetry={session.retry} />;
    case 'tooLarge':
      return (
        <LoadErrorState
          title="Entwurf zu groß"
          message="Dein Entwurf überschreitet die erlaubte Größe. Entferne Bilder oder Texte und lade die Seite neu."
        />
      );
    case 'ready':
      return (
        <SiteDraftProvider ydoc={session.ydoc}>
          <div className="min-h-full flex flex-col bg-grey-100 dark:bg-grey-800">
            <EditorHeader
              save={session.save}
              onPreview={() => setPreviewOpen(true)}
              onBack={onBack}
              previewButtonRef={previewButtonRef}
            >
              <PublishControls site={site} provider={session.provider} />
            </EditorHeader>
            <div className="h-[calc(100dvh-57px)] min-h-0">
              <PreviewPane site={site} />
            </div>
            <EditorDialogs />
            <PreviewDialog
              open={previewOpen}
              onOpenChange={setPreviewOpen}
              returnFocusRef={previewButtonRef}
            >
              <DraftPreview site={site} editable={false} />
            </PreviewDialog>
          </div>
        </SiteDraftProvider>
      );
  }
}
