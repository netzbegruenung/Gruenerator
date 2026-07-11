import { useCanvasCollaboration, MasterCanvasEditor } from '@gruenerator/canvas-editor';
import { PresenceAvatars, useCollaborators } from '@gruenerator/collab';
import { type CanvasDocument } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { EditableTitle } from '@gruenerator/shared/components/EditableTitle';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { DottedBackground } from '../../components/common/DottedBackground';
import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import ErrorBoundary from '../../components/ErrorBoundary';
import { useDocumentTitle } from '../../components/hooks/useDocumentTitle';
import { useCollaborationConfig } from '../../hooks/useCollaborationConfig';
import { useAuthStore } from '../../stores/authStore';

import { ShareCanvasDialog } from './components/ShareCanvasDialog';
import { updateCanvasThumbnail } from './services/canvasThumbnailService';
import { WebCanvasEditorProvider } from './WebCanvasEditorProvider';

import type { InitialPageDef } from '@gruenerator/canvas-editor';

function CollabCanvasStudioContent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const config = useCollaborationConfig();
  const [shareOpen, setShareOpen] = useState(false);

  const queryClient = useQueryClient();

  const { data: canvas, isLoading } = useQuery<CanvasDocument>({
    queryKey: ['canvas', id],
    queryFn: async () => {
      const result = await getContractsClient().canvas.get({ params: { id: id! } });
      if (result.status !== 200) {
        throw new Error(`Failed to load canvas (HTTP ${result.status})`);
      }
      return result.body;
    },
    enabled: !!id,
  });

  const initialPages = useMemo((): InitialPageDef[] | undefined => {
    const pages = canvas?.initial_state.pages;
    if (!Array.isArray(pages) || pages.length === 0) return undefined;
    return (pages as Array<{ configId: string; state: Record<string, unknown> }>)
      .filter((p) => typeof p?.configId === 'string' && p.state != null)
      .map((p) => ({ configId: p.configId as InitialPageDef['configId'], state: p.state }));
  }, [canvas]);

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
          throw new Error(`PATCH returned HTTP ${result.status}`);
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

  // Every download already renders the full-res image, so it doubles as a
  // fresh gallery thumbnail. Only the list key is invalidated — the open
  // document's ['canvas', id] query must not refetch (it would race the
  // optimistic title rename).
  const handleDownload = useCallback(
    (base64: string) => {
      if (!id || !canEdit) return;
      updateCanvasThumbnail(id, base64)
        .then(() => queryClient.invalidateQueries({ queryKey: ['canvas', 'list'] }))
        .catch((err) => console.warn('[CollabCanvasStudioPage] thumbnail refresh failed:', err));
    },
    [id, canEdit, queryClient]
  );

  const handleCancel = useCallback(() => {
    void navigate('/workplace/arbeiten');
  }, [navigate]);

  const collaborators = useCollaborators(collab.provider);

  const isLive = collab.isSynced && collab.isConnected;
  const offlineReason = !collab.isSynced ? 'Synchronisiere...' : 'Verbindung getrennt';

  const chromeCenter = canvas ? (
    <div className="flex items-center gap-sm min-w-0">
      <EditableTitle
        as="span"
        title={canvas.title}
        editable={canEdit}
        onTitleChange={handleTitleChange}
        className="text-[14.5px] font-bold text-white truncate"
        editableClassName="cursor-pointer rounded px-1.5 -mx-1.5 hover:bg-white/15 transition-colors"
        inputClassName="text-[14.5px] font-bold text-white bg-white/15 border border-white/40 rounded px-1.5 -mx-1.5 outline-none w-64 max-w-full placeholder:text-white/60"
        ariaLabel="Canvas-Titel bearbeiten"
      />
      {!isLive && (
        <span
          className="size-2 rounded-full bg-amber-300 shrink-0"
          title={offlineReason}
          aria-label={offlineReason}
          role="status"
        />
      )}
    </div>
  ) : null;

  const chromeRight = <PresenceAvatars collaborators={collaborators} compact />;

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
      <div className="relative flex flex-col h-dvh bg-[var(--editor-bg)]">
        <div className="flex-1 min-h-0">
          <MasterCanvasEditor
            type={canvas.template_type}
            initialState={canvas.initial_state}
            initialPages={initialPages}
            onExport={handleExport}
            onDownload={handleDownload}
            onCancel={handleCancel}
            collaborative={
              collab.ydoc
                ? { ydoc: collab.ydoc, isSynced: collab.isSynced, provider: collab.provider }
                : undefined
            }
            chromeCenter={chromeCenter}
            chromeRight={chromeRight}
            onInvitePeople={() => setShareOpen(true)}
          />
        </div>
        <ShareCanvasDialog
          canvasId={canvas.id}
          canvasType={canvas.template_type}
          initialState={canvas.initial_state}
          defaultTitle={canvas.title}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />
      </div>
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
