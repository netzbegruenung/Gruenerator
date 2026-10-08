import {
  useCanvasCollaboration,
  MasterCanvasEditor,
  parseInitialPages,
  type InitialPageDef,
  type SidebarTabId,
} from '@gruenerator/canvas-editor';
import { PresenceAvatars, useCollaborators } from '@gruenerator/collab';
import { type CanvasDocument } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { EditableTitle } from '@gruenerator/shared/components/EditableTitle';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PiArrowLeft, PiCheck } from 'react-icons/pi';
import { useParams, useSearchParams } from 'react-router-dom';

import { DottedBackground } from '../../components/common/DottedBackground';
import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import ErrorBoundary from '../../components/ErrorBoundary';
import { useDocumentTitle } from '../../components/hooks/useDocumentTitle';
import { useCollaborationConfig } from '../../hooks/useCollaborationConfig';
import { useHostAwareBack } from '../../hooks/useHostAwareBack';
import { useAuthStore } from '../../stores/authStore';
import useCanvasUiStore from '../../stores/canvasUiStore';
import { isEmbedded } from '../../utils/platform';
import { useTourAutostart } from '../tours/useTourAutostart';

import { CanvasChatDocContext } from './CanvasChatDocContext';
import { SaveAsTemplateDialog } from './components/SaveAsTemplateDialog';
import { ShareCanvasDialog } from './components/ShareCanvasDialog';
import { updateCanvasThumbnail } from './services/canvasThumbnailService';
import { WebCanvasEditorProvider } from './WebCanvasEditorProvider';

/** After this long without a first sync, say so and offer a reconnect. */
const SLOW_SYNC_MS = 8000;

function CollabCanvasStudioContent() {
  const { id } = useParams<{ id: string }>();
  // Set by whoever just created the canvas (the app's sharepic hand-off): its
  // initial_state is still the whole truth, so the editor may show it before
  // the collab doc has synced.
  const [searchParams, setSearchParams] = useSearchParams();
  const fresh = searchParams.get('fresh') === '1';
  const handleCancel = useHostAwareBack('/workplace');
  const user = useAuthStore((s) => s.user);
  const config = useCollaborationConfig();
  const [shareOpen, setShareOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
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

  const { data: canvas, isLoading } = useQuery<CanvasDocument>({
    queryKey: ['canvas', id],
    queryFn: async () => {
      const result = await getContractsClient().canvas.get({ params: { id: id! } });
      if (result.status !== 200) {
        throw new ApiError(result.status, `Failed to load canvas (HTTP ${result.status})`);
      }
      return result.body;
    },
    enabled: !!id,
  });

  const initialPages = useMemo(
    (): InitialPageDef[] | undefined => parseInitialPages(canvas?.initial_state.pages),
    [canvas]
  );

  const canEdit = useMemo(() => {
    if (!canvas || !user) return false;
    const uid = String(user.id);
    if (canvas.created_by === uid) return true;
    const perm = canvas.permissions?.[uid];
    return perm ? ['owner', 'editor'].includes(perm.level) : false;
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

  const collab = useCanvasCollaboration({
    documentId: id || '',
    user: collaborationUser,
    config,
  });

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
        inputClassName="text-[14.5px] font-bold text-white bg-white/15 border border-white/40 rounded px-1.5 -mx-1.5 outline-none w-64 max-w-full placeholder:text-white/60"
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

  const chromeRight = <PresenceAvatars collaborators={collaborators} compact />;

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

  if (isLoading || !canvas) {
    return (
      <div className="relative flex flex-col h-dvh bg-background">
        <DottedBackground />
        <div className="z-10 p-md flex items-center gap-sm">
          <div className="size-4 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500" />
          <span className="text-sm text-foreground">Laden...</span>
        </div>
      </div>
    );
  }

  return (
    <WebCanvasEditorProvider>
      <CanvasChatDocContext.Provider value={chatDoc}>
        <div className="relative flex flex-col h-dvh bg-[var(--editor-bg)]">
          <div className="flex-1 min-h-0">
            <MasterCanvasEditor
              key={canvas.id}
              type={canvas.template_type}
              formatId={canvas.format}
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
                    }
                  : undefined
              }
              chromeLeft={chromeLeft}
              chromeCenter={chromeCenter}
              chromeRight={chromeRight}
              onInvitePeople={() => setShareOpen(true)}
              onSaveAsTemplate={() => setSaveTemplateOpen(true)}
              initialTab={initialTab}
              onActiveTabChange={handleActiveTabChange}
            />
          </div>
          <ShareCanvasDialog canvasId={canvas.id} open={shareOpen} onOpenChange={setShareOpen} />
          <SaveAsTemplateDialog
            canvasId={canvas.id}
            canvasType={canvas.template_type}
            initialState={canvas.initial_state}
            formatId={canvas.format}
            defaultTitle={canvas.title}
            open={saveTemplateOpen}
            onOpenChange={setSaveTemplateOpen}
          />
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
