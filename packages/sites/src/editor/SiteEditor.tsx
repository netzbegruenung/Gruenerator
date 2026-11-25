import { useCollaborators, PresenceAvatars } from '@gruenerator/collab';
import {
  buildSitePreviewSnapshot,
  siteDraftToSnapshotSource,
  type SiteRole,
  type SupportedLocale,
} from '@gruenerator/contracts';
import { Button, ToggleGroup, ToggleGroupItem } from '@gruenerator/ui';
import { type HocuspocusProvider } from '@hocuspocus/provider';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { FiUserPlus } from 'react-icons/fi';

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
import { useAnchorRect } from './canvas/useAnchorRect';
import { EditorHeader } from './EditorHeader';
import { EditorSkeleton } from './EditorSkeleton';
import { PreviewDialog } from './PreviewDialog';
import { PublishControls } from './publish/PublishControls';
import { SiteShareDialog } from './share/SiteShareDialog';
import { SiteSidebarPanel, SiteSidebarTabs } from './sidebar/SiteSidebar';

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
    </>
  );
}

type PreviewView = 'draft' | 'live';

export function PreviewPane({ site, editable = true }: { site: SiteData; editable?: boolean }) {
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
          <DraftPreview site={site} editable={editable} />
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

/** The header's height (56px plus its border); the desktop panel starts below it. */
const EDITOR_CHROME_VARS = {
  '--editor-topbar-height': '57px',
  '--image-studio-tab-bar-width': '76px',
} as CSSProperties;

export const PUBLISH_ADMINS_ONLY = 'Veröffentlichen können nur Admins.';

function HeaderPresence({ provider }: { provider: HocuspocusProvider }) {
  const collaborators = useCollaborators(provider);
  return <PresenceAvatars collaborators={collaborators} />;
}

export function SiteEditor({
  site,
  role,
  onBack,
}: {
  site: SiteData;
  role: SiteRole;
  onBack?: () => void;
}) {
  const session = useSiteDraftSession(site.id);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const previewButtonRef = useRef<HTMLButtonElement>(null);
  useLeaveWarning(session.state === 'ready' && session.save !== 'saved');
  // The editor store is module state: leave no selection or open panel behind for the next visit.
  useEffect(
    () => () => useEditorStore.setState({ selection: null, elementPanel: null, sidebarTab: null }),
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
          {/* The sidebar chrome lays out against this root (`data-editor-chrome-root`): on desktop
              the rail sits left of the page and the panel opens beside it; on a phone the tab bar
              is at the bottom and the panel is a sheet between page and tab bar. */}
          <div
            data-editor-chrome-root=""
            style={EDITOR_CHROME_VARS}
            className="relative flex h-dvh min-h-0 flex-col bg-grey-100 dark:bg-grey-800"
          >
            <EditorHeader
              save={session.save}
              onPreview={() => setPreviewOpen(true)}
              onBack={onBack}
              previewButtonRef={previewButtonRef}
            >
              <HeaderPresence provider={session.provider} />
              {role === 'admin' && (
                <>
                  <Button
                    ref={shareButtonRef}
                    variant="outline"
                    onClick={() => setShareOpen(true)}
                    title="Teilen"
                  >
                    <FiUserPlus aria-hidden="true" />
                    <span className="hidden md:inline">Teilen</span>
                  </Button>
                  <PublishControls site={site} provider={session.provider} />
                </>
              )}
            </EditorHeader>
            {role !== 'admin' && (
              <p className="m-0 border-b border-grey-200 bg-background-pure px-md py-xs text-sm text-grey-600 dark:border-grey-700 dark:text-grey-400">
                {PUBLISH_ADMINS_ONLY}
              </p>
            )}
            {role !== 'viewer' && (
              <div className="absolute bottom-0 left-0 top-[var(--editor-topbar-height)] z-[120] max-canvas-mobile:contents">
                <SiteSidebarTabs role={role} />
              </div>
            )}
            <div
              className={
                role === 'viewer'
                  ? 'min-h-0 flex-1'
                  : 'min-h-0 flex-1 canvas-mobile:pl-[calc(var(--image-studio-tab-bar-width)+var(--canvas-panel-width,0px))]'
              }
            >
              <PreviewPane site={site} editable={role !== 'viewer'} />
            </div>
            {role !== 'viewer' && <SiteSidebarPanel />}
            {role === 'admin' && (
              <SiteShareDialog
                site={site}
                open={shareOpen}
                onOpenChange={setShareOpen}
                returnFocusRef={shareButtonRef}
              />
            )}
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
