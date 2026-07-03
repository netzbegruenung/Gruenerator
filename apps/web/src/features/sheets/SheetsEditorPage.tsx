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
import { EditorTopBar } from '@gruenerator/shared/components/EditorTopBar';
import { Skeleton } from '@gruenerator/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { FiShare2 } from 'react-icons/fi';
import { PiTable } from 'react-icons/pi';
import { useNavigate, useParams } from 'react-router-dom';

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

function SheetsEditorContent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const adapter = useDocsAdapter();
  const { user, isAuthResolved } = useAuth({ lazy: true });
  const isGuest = Boolean(isAuthResolved) && !user;

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

  const collabConfig = useCollaborationConfig();
  const { provider, isConnected, isSynced, isLocalLoaded, authError } = useCollaboration({
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
        <span className="text-foreground-heading font-medium">{docData.title || 'Tabelle'}</span>
        <span>Diese Tabelle erfordert eine Anmeldung.</span>
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
        <span>Tabelle nicht gefunden oder nicht öffentlich</span>
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
        <span>{getAuthErrorMessage(authError) || 'Verbindung zur Tabelle fehlgeschlagen.'}</span>
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

      <div className="flex-1 min-h-0 flex items-center justify-center">
        {/* Placeholder until the Univer editor package lands (PR 3). The
            collaboration provider above is already live, so presence works. */}
        <div className="flex flex-col items-center gap-3 text-grey-500">
          <PiTable size={40} className="text-secondary-500" />
          <span className="text-sm">
            {editorReady ? 'Der Tabellen-Editor ist in Kürze verfügbar.' : 'Tabelle wird geladen…'}
          </span>
        </div>
      </div>

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

export default function SheetsEditorPage() {
  return (
    <DocsProvider adapter={webAppDocsAdapter}>
      <ErrorBoundary>
        <SheetsEditorContent />
      </ErrorBoundary>
    </DocsProvider>
  );
}
