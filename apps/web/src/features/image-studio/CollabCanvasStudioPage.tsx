import {
  commitOpenTextEdit,
  getCanvasFormatOrDefault,
  isSlideFormat,
  MasterCanvasEditor,
  preloadCanvasTemplate,
  readInitialDocument,
  type CanvasEditorExportApi,
  type InitialPageDef,
  type SidebarTabId,
} from '@gruenerator/canvas-editor';
import { CanvasEditorSkeleton } from '@gruenerator/canvas-editor/skeleton';
import {
  getAuthErrorMessage,
  PresenceAvatars,
  useCollaboration,
  useCollaborators,
} from '@gruenerator/collab';
import { sharepicFormatSchema, type CanvasDocument } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { EditableTitle } from '@gruenerator/shared/components/EditableTitle';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PiArrowLeft, PiCheck, PiPresentationChart } from 'react-icons/pi';
import { useParams, useSearchParams } from 'react-router-dom';

import { DottedBackground } from '../../components/common/DottedBackground';
import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import ErrorBoundary from '../../components/ErrorBoundary';
import { useDocumentTitle } from '../../components/hooks/useDocumentTitle';
import { handleUnauthorized } from '../../components/utils/apiClient';
import { useCollaborationConfig } from '../../hooks/useCollaborationConfig';
import { useHostAwareBack } from '../../hooks/useHostAwareBack';
import { useAuthStore } from '../../stores/authStore';
import useCanvasUiStore from '../../stores/canvasUiStore';
import { isEmbedded } from '../../utils/platform';
import { useTourAutostart } from '../tours/useTourAutostart';
import { ExportCanvasVorlageButton } from '../vorlagen/components/ExportCanvasVorlageButton';

import { CanvasChatDocContext } from './CanvasChatDocContext';
import { CanvasPresentMode } from './CanvasPresentMode';
import { canvasQueryOptions } from './canvasQuery';
import { updateCanvasThumbnail } from './services/canvasThumbnailService';
import { useNativeEditorChrome } from './useNativeEditorChrome';
import { waitForCollabSync } from './waitForCollabSync';
import { WebCanvasEditorProvider } from './WebCanvasEditorProvider';

import { startTabLink } from '@/utils/startpage';

/** After this long without a first sync, say so and offer a reconnect. */
const SLOW_SYNC_MS = 8000;
/** How long closing the embedded editor waits for unacked collab updates. */
const CLOSE_FLUSH_MS = 1000;

const ShareCanvasDialog = lazy(() =>
  import('./components/ShareCanvasDialog').then((m) => ({ default: m.ShareCanvasDialog }))
);
const SaveAsTemplateDialog = lazy(() =>
  import('./components/SaveAsTemplateDialog').then((m) => ({ default: m.SaveAsTemplateDialog }))
);

function CollabCanvasStudioContent() {
  const { id } = useParams<{ id: string }>();
  // Set by whoever just created the canvas (the app's sharepic hand-off): its
  // initial_state is still the whole truth, so the editor may show it before
  // the collab doc has synced.
  const [searchParams, setSearchParams] = useSearchParams();
  const fresh = searchParams.get('fresh') === '1';
  const user = useAuthStore((s) => s.user);
  const config = useCollaborationConfig();
  const [shareOpen, setShareOpen] = useState(false);
  const exportApi = useRef<CanvasEditorExportApi>(null);
  const [presenting, setPresenting] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  // Einmal geöffnet bleiben die Dialoge gemountet, damit ihre Schließ-Animation läuft.
  const [shareMounted, setShareMounted] = useState(false);
  const [saveTemplateMounted, setSaveTemplateMounted] = useState(false);
  // Read once per canvas: the editor only seeds its tab from it on mount.
  const initialTab = useMemo(
    () => (id ? useCanvasUiStore.getState().initialTabFor(id) : null),
    [id]
  );
  const handleActiveTabChange = useCallback(
    (tab: SidebarTabId | null) => {
      if (id) useCanvasUiStore.getState().setActiveTab(id, tab);
    },
    [id]
  );

  const queryClient = useQueryClient();

  const {
    data: canvas,
    isLoading,
    isError,
  } = useQuery({ ...canvasQueryOptions(id ?? ''), enabled: !!id });

  // Config chunk and fonts load alongside the collab sync instead of after it.
  const templateType = canvas?.template_type;
  const canvasFormat = canvas?.format;
  useEffect(() => {
    if (templateType) void preloadCanvasTemplate(templateType, canvasFormat);
  }, [templateType, canvasFormat]);

  // initial_state is a stored canvas document: read it through the version
  // check, so a document from a newer build is never seeded or written here.
  const initialDocument = useMemo(
    () => (canvas ? readInitialDocument(canvas.initial_state) : null),
    [canvas]
  );
  const initialPages: InitialPageDef[] | undefined = initialDocument?.pages;
  const documentRefusal = initialDocument?.refusal ?? null;

  const canEdit = canvas?.can_edit === true;

  // Only owners may manage who has access; everyone else would get a share
  // dialog stuck loading on the owner-only share-settings endpoint (403).
  const isOwner = useMemo(() => {
    if (!canvas || !user) return false;
    const uid = String(user.id);
    return canvas.created_by === uid || canvas.permissions?.[uid]?.level === 'owner';
  }, [canvas, user]);

  const handleTitleChange = useCallback(
    async (newTitle: string) => {
      if (!id) return;
      const key = ['canvas', id];
      const previous = queryClient.getQueryData<CanvasDocument>(key);
      queryClient.setQueryData<CanvasDocument>(key, (old) =>
        old ? { ...old, title: newTitle } : old
      );
      try {
        const result = await getContractsClient().canvas.update({
          params: { id },
          body: { title: newTitle },
        });
        if (result.status !== 200) {
          throw new ApiError(result.status, `PATCH returned HTTP ${result.status}`);
        }
      } catch (err) {
        console.error('[canvas-rename] PATCH failed, reverting', err);
        queryClient.setQueryData(key, previous);
      }
    },
    [id, queryClient]
  );

  useDocumentTitle(canvas?.title);

  const hostChrome = useNativeEditorChrome({
    title: canvas?.title ?? null,
    canEdit,
    exportApi,
    onRename: handleTitleChange,
  });

  const collaborationUser = useMemo(
    () =>
      user
        ? {
            id: String(user.id),
            display_name: user.display_name,
            email: user.email,
            avatar_robot_id: user.avatar_robot_id ? Number(user.avatar_robot_id) : null,
          }
        : null,
    // Depend on the specific fields, not the user object identity, so collab
    // isn't re-initialized when `user` gets a new reference with equal fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id, user?.display_name, user?.email, user?.avatar_robot_id]
  );

  const collab = useCollaboration({
    documentId: id || '',
    user: collaborationUser,
    config,
  });

  const collabProvider = collab.provider;
  const flushBeforeClose = useCallback(async () => {
    commitOpenTextEdit();
    await waitForCollabSync(collabProvider, CLOSE_FLUSH_MS);
  }, [collabProvider]);
  const handleCancel = useHostAwareBack(startTabLink('arbeiten'), flushBeforeClose);

  // A durable Hocuspocus auth failure otherwise leaves "Verbindung getrennt"
  // forever. The probe in handleUnauthorized tells a dead session (SESSION_LOST
  // when embedded, login redirect on web) from a deleted/denied canvas, which
  // only gets a message.
  const { authError } = collab;
  const [accessError, setAccessError] = useState<string | null>(null);
  useEffect(() => {
    if (!authError) return;
    handleUnauthorized('collab-auth')
      .then((outcome) => {
        if (outcome === 'logout') return;
        // The server refused this canvas for a live session, so reconnecting
        // cannot help: replace the editor rather than toast over a skeleton
        // that waits forever.
        const message = getAuthErrorMessage(authError);
        if (message) setAccessError(message);
      })
      .catch((error) => console.error('[Canvas] Auth failure handling failed', error));
  }, [authError]);

  const handleExport = useCallback((_base64: string) => {
    // No-op in collab mode — Hocuspocus persists state.
  }, []);

  // Fresh gallery thumbnail from every full-res render: downloads and the
  // editor's debounced collab snapshots (without the latter, recents kept
  // showing the pre-edit state). Only the list key is invalidated — the open
  // document's ['canvas', id] query must not refetch (it would race the
  // optimistic title rename).
  const refreshThumbnail = useCallback(
    (base64: string) => {
      if (!id || !canEdit) return;
      updateCanvasThumbnail(id, base64)
        .then(() => queryClient.invalidateQueries({ queryKey: ['canvas', 'list'] }))
        .catch((err) => console.warn('[CollabCanvasStudioPage] thumbnail refresh failed:', err));
    },
    [id, canEdit, queryClient]
  );

  const collaborators = useCollaborators(collab.provider);

  const chatDoc = useMemo(
    () => (id ? { documentId: id, title: canvas?.title ?? null } : null),
    [id, canvas?.title]
  );

  // Once synced the doc is the truth; a reload must not preview initial_state
  // again, it may be stale by then.
  useEffect(() => {
    if (!fresh || !collab.isSynced) return;
    setSearchParams(
      (params) => {
        params.delete('fresh');
        return params;
      },
      { replace: true }
    );
  }, [fresh, collab.isSynced, setSearchParams]);

  const [syncSlow, setSyncSlow] = useState(false);
  useEffect(() => {
    if (collab.isSynced) return undefined;
    const timer = setTimeout(() => setSyncSlow(true), SLOW_SYNC_MS);
    return () => {
      clearTimeout(timer);
      setSyncSlow(false);
    };
  }, [collab.isSynced]);

  const isLive = collab.isSynced && collab.isConnected;
  const offlineReason = !collab.isSynced
    ? syncSlow
      ? 'Verbindung dauert länger...'
      : 'Synchronisiere...'
    : 'Verbindung getrennt';
  const reconnectButton =
    syncSlow && collab.provider ? (
      <button
        type="button"
        onClick={() => void collab.provider?.connect()}
        className="shrink-0 rounded px-1.5 text-xs font-semibold text-white underline underline-offset-2 hover:bg-white/15"
      >
        Erneut verbinden
      </button>
    ) : null;

  // No isSynced gate: runTour polls for visible anchors anyway, and the tour
  // should also appear when collab sync is slow.
  // Not embedded: the tour paints a full-viewport overlay with its own
  // controls over a WebView the user cannot navigate away from.
  useTourAutostart('canvas', !isLoading && !!canvas && canEdit && !isEmbedded(), () => {
    void import('../tours/canvasTour').then((m) => m.startCanvasTour());
  });

  const chromeCenter = canvas ? (
    <div className="flex items-center gap-sm min-w-0 max-canvas-mobile:flex-col max-canvas-mobile:items-start max-canvas-mobile:gap-0">
      <EditableTitle
        as="span"
        title={canvas.title}
        editable={canEdit}
        onTitleChange={handleTitleChange}
        className="max-w-full text-[14.5px] font-bold text-white truncate"
        editableClassName="cursor-pointer rounded px-1.5 -mx-1.5 hover:bg-white/15 transition-colors"
        inputClassName="text-[14.5px] [@media(pointer:coarse)]:text-[16px] font-bold text-white bg-white/15 border border-white/40 rounded px-1.5 -mx-1.5 outline-none w-64 max-w-full placeholder:text-white/60"
        ariaLabel="Canvas-Titel bearbeiten"
      />
      {!isLive && (
        <span
          className="size-2 rounded-full bg-amber-300 shrink-0 max-canvas-mobile:hidden"
          title={offlineReason}
          aria-label={offlineReason}
          role="status"
        />
      )}
      {/* Mobil ist Platz für eine Zeile unter dem Titel statt eines Punkts. */}
      <span className="canvas-mobile:hidden flex items-center gap-1 text-xs text-white/80">
        {isLive ? (
          <>
            <PiCheck size={12} aria-hidden="true" />
            Gespeichert
          </>
        ) : (
          offlineReason
        )}
      </span>
      {reconnectButton}
    </div>
  ) : null;

  const chromeRight = (
    <div className="flex items-center gap-2">
      {/* Sharepic formats are built from Seiten; a whole Vorlage there would never be offered. */}
      {canvas && canEdit && !sharepicFormatSchema.safeParse(canvas.format).success ? (
        <ExportCanvasVorlageButton exportApi={exportApi} formatId={canvas.format} />
      ) : null}
      {canvas && isSlideFormat(getCanvasFormatOrDefault(canvas.format)) ? (
        <button
          type="button"
          onClick={() => setPresenting(true)}
          className="flex items-center gap-1.5 rounded-[10px] border-none bg-white/15 px-3 h-[34px] text-sm font-medium text-white cursor-pointer hover:bg-white/25"
        >
          <PiPresentationChart size={16} aria-hidden="true" />
          Präsentieren
        </button>
      ) : null}
      <PresenceAvatars collaborators={collaborators} compact />
    </div>
  );

  // Immersive layout hides the global app sidebar, so this back button is the
  // way out of the editor — mirrors the docs EditorTopBar back button.
  const chromeLeft = (
    <button
      type="button"
      onClick={handleCancel}
      aria-label="Zurück zum Studio"
      title="Zurück zum Studio"
      className="flex items-center justify-center size-[34px] max-canvas-mobile:size-8 rounded-[10px] border-none bg-transparent cursor-pointer text-white/90 transition-[background-color,color] duration-200 hover:bg-white/15 hover:text-white"
    >
      <PiArrowLeft size={20} />
    </button>
  );

  if (isError || accessError || documentRefusal) {
    return (
      <div className="relative flex flex-col h-dvh bg-background">
        <DottedBackground />
        {/* The back button is styled for the editor's green bar. */}
        {!hostChrome && (
          <div className="z-10 h-[var(--editor-topbar-height)] shrink-0 bg-[image:var(--editor-menubar-gradient)] px-4 flex items-center max-canvas-mobile:h-[52px] max-canvas-mobile:px-2.5">
            {chromeLeft}
          </div>
        )}
        <p className="z-10 p-md text-sm text-foreground" role="alert">
          {accessError ??
            (documentRefusal?.status === 'newer'
              ? 'Dieser Canvas wurde mit einer neueren Version des Grünerators gespeichert. Lade die Seite neu, um ihn zu öffnen.'
              : documentRefusal
                ? 'Dieser Canvas kann nicht sicher geöffnet werden.'
                : 'Der Canvas konnte nicht geladen werden.')}
        </p>
      </div>
    );
  }

  if (isLoading || !canvas) {
    return <CanvasEditorSkeleton chromeLeft={chromeLeft} topBar={!hostChrome} />;
  }

  return (
    <WebCanvasEditorProvider allowVorlagen={canEdit}>
      <CanvasChatDocContext.Provider value={chatDoc}>
        <div className="relative flex flex-col h-dvh bg-[var(--editor-bg)]">
          <div className="flex-1 min-h-0">
            <MasterCanvasEditor
              key={canvas.id}
              type={canvas.template_type}
              formatId={canvas.format}
              documentTitle={canvas.title}
              initialState={canvas.initial_state}
              initialPages={initialPages}
              onExport={handleExport}
              onDownload={refreshThumbnail}
              onCollabSnapshot={refreshThumbnail}
              onCancel={handleCancel}
              collaborative={
                collab.ydoc
                  ? {
                      ydoc: collab.ydoc,
                      isSynced: collab.isSynced,
                      provider: collab.provider,
                      previewBeforeSync: fresh,
                      isLocalLoaded: collab.isLocalLoaded,
                    }
                  : undefined
              }
              {...(hostChrome ? { hostChrome } : { chromeLeft, chromeCenter, chromeRight })}
              exportApiRef={exportApi}
              {...(isOwner
                ? {
                    onInvitePeople: () => {
                      setShareMounted(true);
                      setShareOpen(true);
                    },
                  }
                : {})}
              onSaveAsTemplate={() => {
                setSaveTemplateMounted(true);
                setSaveTemplateOpen(true);
              }}
              initialTab={initialTab}
              onActiveTabChange={handleActiveTabChange}
              // The connection's scope, not canEdit: project shares and editor links grant writes `permissions` lacks.
              readOnly={collab.isReadOnly}
            />
          </div>
          {/* Lazy und erst beim ersten Öffnen gemountet: der Share-Dialog zieht
              den Docs-Editor (BlockNote) nach, den der Canvas sonst nie braucht. */}
          {presenting && (
            <CanvasPresentMode exportApi={exportApi} onClose={() => setPresenting(false)} />
          )}
          <Suspense fallback={null}>
            {shareMounted && (
              <ShareCanvasDialog
                canvasId={canvas.id}
                open={shareOpen}
                onOpenChange={setShareOpen}
              />
            )}
            {saveTemplateMounted && (
              <SaveAsTemplateDialog
                canvasId={canvas.id}
                canvasType={canvas.template_type}
                initialState={canvas.initial_state}
                formatId={canvas.format}
                defaultTitle={canvas.title}
                open={saveTemplateOpen}
                onOpenChange={setSaveTemplateOpen}
              />
            )}
          </Suspense>
        </div>
      </CanvasChatDocContext.Provider>
    </WebCanvasEditorProvider>
  );
}

function CollabCanvasStudioPage() {
  return (
    <ErrorBoundary>
      <CollabCanvasStudioContent />
    </ErrorBoundary>
  );
}

export default withAuthRequired(CollabCanvasStudioPage, { title: 'Canvas' });
