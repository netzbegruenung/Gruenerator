import { useCollaborators, PresenceAvatars } from '@gruenerator/collab';
import {
  buildSitePreviewSnapshot,
  siteDraftToSnapshotSource,
  type SiteRole,
  type SupportedLocale,
} from '@gruenerator/contracts';
import { cn } from '@gruenerator/shared/utils';
import { Button } from '@gruenerator/ui';
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
import {
  usePreviewHighlight,
  usePreviewInsertMark,
  usePreviewSelection,
} from '../preview/usePreviewInteractions';
import { useAuth } from '../SitesContext';
import { useEditorStore } from '../stores/editorStore';

import { CanvasToolbar } from './canvas/CanvasToolbar';
import { useAnchorRect } from './canvas/useAnchorRect';
import { CANVAS_DEVICE_WIDTH, EditorHeader, type CanvasDevice } from './EditorHeader';
import { EditorSkeleton } from './EditorSkeleton';
import { PreviewDialog } from './PreviewDialog';
import { usePublishControls } from './publish/usePublishControls';
import { SiteShareDialog } from './share/SiteShareDialog';
import { SiteSidebarPanel, SiteSidebarTabs } from './sidebar/SiteSidebar';
import { useUndoShortcuts } from './useUndoShortcuts';

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

export type PreviewView = 'draft' | 'live';

interface PreviewPaneProps {
  site: SiteData;
  view: PreviewView;
  onViewChange: (view: PreviewView) => void;
  device: CanvasDevice;
  editable?: boolean;
}

export function PreviewPane({
  site,
  view,
  onViewChange,
  device,
  editable = true,
}: PreviewPaneProps) {
  const published = site.published_snapshot;
  const showLive = view === 'live' && published !== null;
  const width = CANVAS_DEVICE_WIDTH[device];
  return (
    <div className="flex h-full flex-col items-center">
      {showLive && (
        <p className="m-0 flex shrink-0 items-center gap-xs py-xs text-sm text-grey-600 dark:text-grey-400">
          Du siehst den Live-Stand.
          <button
            type="button"
            onClick={() => onViewChange('draft')}
            className="rounded-sm font-semibold text-primary-600 hover:underline dark:text-primary-300"
          >
            Zurück zum Entwurf
          </button>
        </p>
      )}
      <div
        data-device={device}
        style={width ? { width } : undefined}
        className={cn(
          'min-h-0 w-full max-w-full flex-1 transition-[width] duration-300 motion-reduce:transition-none',
          width && 'bg-background-pure shadow-lg'
        )}
      >
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
  useUndoShortcuts(doc);
  usePreviewSelection(doc);
  usePreviewHighlight(doc);
  usePreviewInsertMark(doc);
  return null;
}

/** The header's height (44px plus its border); the desktop panel starts below it. */
const EDITOR_CHROME_VARS = {
  '--editor-topbar-height': '45px',
  '--image-studio-tab-bar-width': '76px',
} as CSSProperties;

export const PUBLISH_ADMINS_ONLY = 'Veröffentlichen können nur Admins.';

function HeaderPresence({ provider }: { provider: HocuspocusProvider }) {
  const collaborators = useCollaborators(provider);
  return <PresenceAvatars collaborators={collaborators} />;
}

type EditorTopBarProps = Omit<Parameters<typeof EditorHeader>[0], 'menu' | 'publish'> &
  Parameters<typeof usePublishControls>[0];

/** The header inside the draft provider: publishing reads the draft. */
function EditorTopBar({ site, provider, onShowLive, ...header }: EditorTopBarProps) {
  const { menu, button } = usePublishControls({ site, provider, onShowLive });
  return <EditorHeader {...header} menu={menu} publish={button} />;
}

/** Editors and viewers: the site name without its menu (publish, unpublish, delete are admin). */
function MemberTopBar(header: Omit<Parameters<typeof EditorHeader>[0], 'menu' | 'publish'>) {
  const title = useDraft((d) => d.site_title.trim()) || 'Website';
  return (
    <EditorHeader
      {...header}
      menu={<span className="truncate px-sm text-sm font-semibold text-foreground">{title}</span>}
      publish={null}
    />
  );
}

export function SiteEditor({
  site,
  role,
  group,
  onBack,
}: {
  site: SiteData;
  role: SiteRole;
  group: { id: string; name: string } | null;
  onBack?: () => void;
}) {
  const session = useSiteDraftSession(site.id);
  const [shareOpen, setShareOpen] = useState(false);
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [view, setView] = useState<PreviewView>('draft');
  const [device, setDevice] = useState<CanvasDevice>('desktop');
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
    case 'ready': {
      const header = {
        save: session.save,
        device,
        onDeviceChange: setDevice,
        onPreview: () => setPreviewOpen(true),
        onBack,
        previewButtonRef,
      };
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
            {role === 'admin' ? (
              <EditorTopBar
                site={site}
                provider={session.provider}
                onShowLive={() => setView('live')}
                {...header}
              >
                <HeaderPresence provider={session.provider} />
                <Button
                  ref={shareButtonRef}
                  variant="ghost"
                  size="sm"
                  onClick={() => setShareOpen(true)}
                  title="Teilen"
                >
                  <FiUserPlus aria-hidden="true" />
                  <span className="hidden md:inline">Teilen</span>
                </Button>
              </EditorTopBar>
            ) : (
              <MemberTopBar {...header}>
                <HeaderPresence provider={session.provider} />
              </MemberTopBar>
            )}
            {role !== 'admin' && (
              // Same left inset as the preview below: the sidebar rail overlays this column.
              <div
                className={
                  role === 'viewer'
                    ? 'border-b border-grey-200 bg-background-pure dark:border-grey-700'
                    : 'border-b border-grey-200 bg-background-pure dark:border-grey-700 canvas-mobile:pl-[calc(var(--image-studio-tab-bar-width)+var(--canvas-panel-width,0px))]'
                }
              >
                <p className="m-0 px-md py-xs text-sm text-grey-600 dark:text-grey-400">
                  {PUBLISH_ADMINS_ONLY}
                </p>
              </div>
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
              <PreviewPane
                site={site}
                view={view}
                onViewChange={setView}
                device={device}
                editable={role !== 'viewer'}
              />
            </div>
            {role !== 'viewer' && <SiteSidebarPanel />}
            {role === 'admin' && (
              <SiteShareDialog
                site={site}
                isProjectSite={group !== null}
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
}
