import {
  useCollaboration,
  useCollaborators,
  useDelayedConnectionStatus,
  useSyncGate,
  getAuthErrorMessage,
} from '@gruenerator/collab';
import {
  DocsProvider,
  useDocsAdapter,
  useUpdateDocument,
  lazyWithRetry,
  ErrorBoundary,
  type Document,
} from '@gruenerator/docs';
import { PresentationEditor, type PresentationEditorApi } from '@gruenerator/presentations';
import { EditorTopBar } from '@gruenerator/shared/components/EditorTopBar';
import { Skeleton } from '@gruenerator/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { FiCornerUpLeft, FiCornerUpRight, FiDownload, FiPlay, FiShare2 } from 'react-icons/fi';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { CollaboratorAvatars } from '../../components/editor/CollaboratorAvatars';
import { useDocumentTitle } from '../../components/hooks/useDocumentTitle';
import { useAuth } from '../../hooks/useAuth';
import { useCollaborationConfig } from '../../hooks/useCollaborationConfig';
import { platformFetch } from '../../utils/platformFetch';
import { webAppDocsAdapter } from '../docs/docsAdapter';
import { GuestBadge, GUEST_ANIMALS } from '../docs/GuestBadge';
import { getOrCreateGuestIdentity } from '../docs/guestIdentity';

const ShareModal = lazyWithRetry(() =>
  import('@gruenerator/docs').then((m) => ({ default: m.ShareModal }))
);

// PresentMode is the only reveal.js consumer — lazy-load it from its own
// subpath so reveal + its CSS land in a separate chunk (never in the editor's).
const PresentMode = lazyWithRetry(() =>
  import('@gruenerator/presentations/present').then((m) => ({ default: m.PresentMode }))
);

function PresentationsEditorContent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const adapter = useDocsAdapter();
  const { user, isAuthResolved } = useAuth({ lazy: true });
  const isGuest = Boolean(isAuthResolved) && !user;

  const [searchParams] = useSearchParams();

  const guestIdentity = useMemo(() => (isGuest ? getOrCreateGuestIdentity() : null), [isGuest]);

  const API_BASE = useMemo(() => adapter.getApiBaseUrl(), [adapter]);

  const { data: docData, isLoading: docIsLoading } = useQuery<Document | null>({
    queryKey: ['document', id],
    queryFn: async () => {
      const res = await platformFetch(`${API_BASE}/docs/resolve/${id}`, {
        credentials: 'include',
      });
      if (!res.ok) return null;
      return (await res.json()) as Document;
    },
    enabled: !!id,
    retry: false,
    staleTime: 30_000,
  });

  useDocumentTitle(docData?.title);

  const canEdit = useMemo(() => {
    if (!docData) return false;
    if (isGuest) return docData.share_permission !== 'viewer';
    if (docData.created_by === user?.id) return true;
    const perm = docData.permissions?.[user?.id ?? ''];
    if (perm) return ['owner', 'editor'].includes(perm.level);
    return docData.share_permission !== 'viewer';
  }, [docData, isGuest, user]);

  const queryClient = useQueryClient();
  const { mutateAsync: updateDocument } = useUpdateDocument();

  const handleTitleChange = useCallback(
    async (newTitle: string) => {
      if (!id) return;
      const activeKey = ['document', id];
      queryClient.setQueryData(activeKey, (old: Document | undefined) =>
        old ? { ...old, title: newTitle } : old
      );
      try {
        await updateDocument({ id, updates: { title: newTitle } });
      } catch {
        await queryClient.invalidateQueries({ queryKey: activeKey });
      }
    },
    [id, queryClient, updateDocument]
  );

  const [showShareModal, setShowShareModal] = useState(false);
  const [editorApi, setEditorApi] = useState<PresentationEditorApi | null>(null);

  // Present mode: opened by the button, or automatically when the page is
  // reached with ?present=1 (the PDF export path adds &print-pdf).
  const autoPresent = searchParams.get('present') === '1';
  const printPdf = searchParams.has('print-pdf');
  const [presenting, setPresenting] = useState(autoPresent);

  const collabConfig = useCollaborationConfig();
  const { ydoc, provider, isConnected, isSynced, isLocalLoaded, authError } = useCollaboration({
    documentId: isAuthResolved ? id || '' : '',
    user: isGuest
      ? null
      : user
        ? { id: String(user.id), display_name: user.display_name, email: user.email }
        : null,
    config: collabConfig,
    isGuest,
    guestId: guestIdentity?.guestId,
    guestName: guestIdentity?.guestName,
  });
  const collaborators = useCollaborators(provider);
  const editorReady = useSyncGate(provider, isSynced);
  const connectionStatus = useDelayedConnectionStatus(isConnected, isLocalLoaded);

  useEffect(() => {
    if (!authError) return;
    const message = getAuthErrorMessage(authError);
    if (message) {
      void import('sonner').then(({ toast }) => toast.error(message));
    }
  }, [authError]);

  const isEditable = canEdit && !authError;

  const openPdfExport = useCallback(() => {
    if (!id) return;
    window.open(`/docs/${id}?present=1&print-pdf`, '_blank', 'noopener');
  }, [id]);

  if (docIsLoading || !isAuthResolved) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-sm px-md py-xs border-b border-grey-200 dark:border-grey-700">
          <Skeleton className="h-5 w-48" />
          <div className="ml-auto flex gap-xs">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        </div>
        <div className="flex-1" />
      </div>
    );
  }

  if (docData?.share_mode === 'authenticated' && isGuest) {
    return (
      <div className="flex items-center justify-center h-full flex-col gap-4 text-grey-500">
        <span className="text-foreground-heading font-medium">
          {docData.title || 'Präsentation'}
        </span>
        <span>Diese Präsentation erfordert eine Anmeldung.</span>
        <a
          href={`/login?redirectTo=${encodeURIComponent(`/docs/${id}`)}`}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 no-underline transition-colors"
        >
          Anmelden
        </a>
      </div>
    );
  }

  if (!docData) {
    return (
      <div className="flex items-center justify-center h-full flex-col gap-4 text-grey-500">
        <span>Präsentation nicht gefunden oder nicht öffentlich</span>
        {isGuest && (
          <a
            href={`/login?redirectTo=${encodeURIComponent(`/docs/${id}`)}`}
            className="text-secondary-600 underline"
          >
            Anmelden
          </a>
        )}
      </div>
    );
  }

  if (isGuest && authError) {
    return (
      <div className="flex items-center justify-center h-full flex-col gap-4 text-grey-500">
        <span>
          {getAuthErrorMessage(authError) || 'Verbindung zur Präsentation fehlgeschlagen.'}
        </span>
        <a
          href={`/login?redirectTo=${encodeURIComponent(`/docs/${id}`)}`}
          className="text-secondary-600 underline"
        >
          Anmelden
        </a>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative">
      <EditorTopBar
        title={docData.title}
        connectionStatus={connectionStatus}
        onBack={isGuest ? undefined : () => navigate('/docs')}
        editable={isEditable}
        onTitleChange={handleTitleChange}
        rightActions={
          <>
            {isGuest && guestIdentity && (
              <GuestBadge
                guestName={guestIdentity.guestName}
                guestColor={guestIdentity.guestColor}
                guestIcon={GUEST_ANIMALS[guestIdentity.guestAnimalIndex].icon}
                loginUrl={`/login?redirectTo=${encodeURIComponent(`/docs/${id}`)}`}
              />
            )}
            {!isGuest && !canEdit && (
              <div className="flex items-center py-1 px-2.5 text-[0.75rem] rounded-full bg-grey-100/60 dark:bg-grey-800/40 text-grey-600 dark:text-grey-400 border border-grey-200/50 dark:border-grey-700/50">
                Lesezugriff
              </div>
            )}
            <CollaboratorAvatars collaborators={collaborators} />
            {isEditable && editorApi && (
              <>
                <button
                  className="glass-btn"
                  onClick={editorApi.undo}
                  aria-label="Rückgängig"
                  title="Rückgängig (Strg+Z)"
                >
                  <FiCornerUpLeft />
                </button>
                <button
                  className="glass-btn"
                  onClick={editorApi.redo}
                  aria-label="Wiederholen"
                  title="Wiederholen (Strg+Umschalt+Z)"
                >
                  <FiCornerUpRight />
                </button>
              </>
            )}
            <button
              className="glass-btn"
              onClick={() => setPresenting(true)}
              aria-label="Präsentieren"
              title="Präsentieren"
            >
              <FiPlay />
            </button>
            <button
              className="glass-btn"
              onClick={openPdfExport}
              aria-label="Als PDF exportieren"
              title="Als PDF exportieren"
            >
              <FiDownload />
            </button>
            {!isGuest && (
              <button
                className="glass-btn"
                onClick={() => setShowShareModal(true)}
                aria-label="Teilen"
                title="Teilen"
              >
                <FiShare2 />
              </button>
            )}
          </>
        }
      />

      <div className="flex-1 min-h-0 overflow-hidden">
        {editorReady && ydoc ? (
          <PresentationEditor key={id} ydoc={ydoc} editable={isEditable} onReady={setEditorApi} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-grey-500 h-full">
            Präsentation wird geladen…
          </div>
        )}
      </div>

      {presenting && ydoc && (
        <Suspense fallback={null}>
          <PresentMode ydoc={ydoc} printPdf={printPdf} onClose={() => setPresenting(false)} />
        </Suspense>
      )}

      {showShareModal && (
        <Suspense fallback={null}>
          <ShareModal
            documentId={id!}
            documentTitle={docData.title}
            onClose={() => setShowShareModal(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

export default function PresentationsEditorPage() {
  return (
    <DocsProvider adapter={webAppDocsAdapter}>
      <ErrorBoundary>
        <PresentationsEditorContent />
      </ErrorBoundary>
    </DocsProvider>
  );
}
