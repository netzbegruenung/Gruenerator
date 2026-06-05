import { useCollaboration, useCollaborators, getAuthErrorMessage } from '@gruenerator/collab';
import {
  DocsProvider,
  useDocumentChat,
  BlockNoteEditor as BlockNoteEditorComponent,
  VersionHistory,
  usePendingDocAI,
  useVersionHistoryShortcut,
  useDocsAdapter,
  createDocsApiClient,
  lazyWithRetry,
  ErrorBoundary,
  type Document,
} from '@gruenerator/docs';
import { getRobotAvatarPath } from '@gruenerator/shared/avatar';
import { EditorTopBar } from '@gruenerator/shared/components/EditorTopBar';
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  Skeleton,
} from '@gruenerator/ui';
import { WolkeSaveModal, uploadToWolke, useShareLinks } from '@gruenerator/wolke';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  memo,
} from 'react';
import { createPortal } from 'react-dom';
import {
  FiChevronDown,
  FiClock,
  FiCloud,
  FiDownload,
  FiMessageCircle,
  FiMessageSquare,
  FiMoreVertical,
  FiShare2,
  FiSidebar,
  FiX,
} from 'react-icons/fi';
import { PiSun, PiMoon, PiDesktop } from 'react-icons/pi';
import { useBeforeUnload, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { z } from 'zod';

import useDarkMode from '../../components/hooks/useDarkMode';
import { useDocumentTitle } from '../../components/hooks/useDocumentTitle';
import { useAuth } from '../../hooks/useAuth';
import { useCollaborationConfig } from '../../hooks/useCollaborationConfig';

import { webAppDocsAdapter } from './docsAdapter';
import { GuestBadge, GUEST_ANIMALS } from './GuestBadge';
import { useDocsLiveWolkeSync } from './useDocsLiveWolkeSync';

import type { BlockNoteEditor } from '@blocknote/core';

const MemoizedBlockNoteEditor = memo(BlockNoteEditorComponent);

const ShareModal = lazyWithRetry(() =>
  import('@gruenerator/docs').then((m) => ({ default: m.ShareModal }))
);
const ChatSidebar = lazyWithRetry(() =>
  import('@gruenerator/docs').then((m) => ({ default: m.ChatSidebar }))
);
const DocsChatPanel = lazyWithRetry(() =>
  import('./DocsChatPanel').then((m) => ({ default: m.DocsChatPanel }))
);

const GUEST_COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#FFA07A',
  '#98D8C8',
  '#F7DC6F',
  '#BB8FCE',
  '#85C1E2',
  '#F8B739',
  '#52B788',
];

const guestIdentitySchema = z.object({
  guestId: z.string(),
  guestName: z.string(),
  guestColor: z.string(),
  guestAnimalIndex: z.number(),
});

type GuestIdentity = z.infer<typeof guestIdentitySchema>;

function getOrCreateGuestIdentity(): GuestIdentity {
  const stored = localStorage.getItem('docs-guest-identity');
  if (stored) {
    try {
      const parsed = guestIdentitySchema.safeParse(JSON.parse(stored));
      if (parsed.success) return parsed.data;
    } catch {
      /* malformed JSON — fall through to regenerate */
    }
  }

  const animalIndex = Math.floor(Math.random() * GUEST_ANIMALS.length);
  const identity: GuestIdentity = {
    guestId: `guest-${crypto.randomUUID().slice(0, 8)}`,
    guestName: GUEST_ANIMALS[animalIndex].name,
    guestColor: GUEST_COLORS[Math.floor(Math.random() * GUEST_COLORS.length)],
    guestAnimalIndex: animalIndex,
  };

  localStorage.setItem('docs-guest-identity', JSON.stringify(identity));
  return identity;
}

type SidebarPanel = 'chat' | 'legacy-chat' | 'comments' | 'versions';

const SIDEBAR_TITLES: Record<SidebarPanel, string> = {
  chat: 'Chat',
  'legacy-chat': 'Älterer Chat',
  comments: 'Kommentare',
  versions: 'Versionen',
};

function EditorFAB({
  showDisconnected,
  sidebarOpen,
  onToggleSidebar,
}: {
  showDisconnected: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}) {
  return (
    <button
      className={`fixed bottom-6 right-6 w-12 h-12 rounded-full flex items-center justify-center bg-white/85 dark:bg-grey-900/85 backdrop-blur-xl border border-black/8 dark:border-white/10 shadow-lg cursor-pointer z-[150] transition-all hover:bg-white/95 dark:hover:bg-grey-800/95 hover:shadow-xl active:scale-95 [&_svg]:w-[22px] [&_svg]:h-[22px] [&_svg]:text-grey-700 dark:[&_svg]:text-grey-300 ${sidebarOpen ? 'bg-secondary-100 dark:bg-secondary-600/25 border-secondary-400 dark:border-secondary-600 z-[250] [&_svg]:text-secondary-700 dark:[&_svg]:text-secondary-400' : ''}`}
      onClick={onToggleSidebar}
      aria-label="Seitenleiste ein-/ausblenden"
    >
      <FiSidebar />
      {showDisconnected && (
        <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full border-[1.5px] border-white/90 dark:border-grey-900/90 bg-red-500" />
      )}
    </button>
  );
}

function EditorContent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEmbedded = searchParams.get('embedded') === 'true';
  const adapter = useDocsAdapter();
  const apiClient = useMemo(() => createDocsApiClient(adapter), [adapter]);
  const { user, isAuthResolved } = useAuth({ lazy: true });
  const isGuest = Boolean(isAuthResolved) && !user;
  const [, , themePreference, cycleTheme] = useDarkMode();

  const guestIdentity = useMemo(() => (isGuest ? getOrCreateGuestIdentity() : null), [isGuest]);

  const API_BASE = useMemo(() => adapter.getApiBaseUrl(), [adapter]);

  const { data: docData, isLoading: docIsLoading } = useQuery<Document | null>({
    queryKey: ['document', id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/docs/resolve/${id}`, {
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

  const handleTitleChange = useCallback(
    async (newTitle: string) => {
      if (!id) return;
      const activeKey = ['document', id];
      queryClient.setQueryData(activeKey, (old: Document | undefined) =>
        old ? { ...old, title: newTitle } : old
      );
      try {
        await apiClient.put(`/docs/${id}`, { title: newTitle });
      } catch {
        queryClient.setQueryData(activeKey, docData);
      }
    },
    [id, apiClient, queryClient, docData]
  );

  const [showShareModal, setShowShareModal] = useState(false);
  const [showWolkeModal, setShowWolkeModal] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showExportSubmenu, setShowExportSubmenu] = useState(false);
  const [activeSidebar, setActiveSidebar] = useState<SidebarPanel | null>(null);
  // Sticky: once the chat panel is opened, DocsChatPanel stays mounted to
  // preserve its runtime + Hocuspocus connection across close/reopen. Avoids
  // paying the chat infra cost for users who never open the panel.
  const [hasOpenedChat, setHasOpenedChat] = useState(false);
  useEffect(() => {
    if (activeSidebar === 'chat' && !hasOpenedChat) setHasOpenedChat(true);
  }, [activeSidebar, hasOpenedChat]);
  const [editor, setEditor] = useState<BlockNoteEditor | null>(null);

  const { data: shareLinks } = useShareLinks('personal', null, { enabled: !isGuest });
  const wolkeConnected = (shareLinks?.length ?? 0) > 0;

  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const actionsButtonRef = useRef<HTMLButtonElement>(null);
  const [actionsMenuRect, setActionsMenuRect] = useState<{ top: number; right: number } | null>(
    null
  );
  const commentsPortalRef = useRef<HTMLDivElement>(null);
  const [commentsPortalTarget, setCommentsPortalTarget] = useState<HTMLElement | null>(null);

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

  const commentCount = useSyncExternalStore(
    useCallback(
      (onChange) => {
        if (!ydoc) return () => {};
        const threads = ydoc.getMap('threads');
        threads.observe(onChange);
        return () => threads.unobserve(onChange);
      },
      [ydoc]
    ),
    () => (ydoc ? ydoc.getMap('threads').size : 0),
    () => 0
  );

  const { messages, sendMessage, getLocalUser, setTyping, typingUsers } = useDocumentChat({
    ydoc,
    provider,
    isSynced,
  });

  useEffect(() => {
    if (!authError) return;
    const message = getAuthErrorMessage(authError);
    if (message) {
      void import('sonner').then(({ toast }) => toast.error(message));
    }
  }, [authError]);

  const handleEditorReady = useCallback((editorInstance: BlockNoteEditor) => {
    setEditor(editorInstance);
  }, []);

  // While AI suggestions are pending review, the changes live in a detached
  // (un-synced) Y.Doc fork. Warn before a hard navigation (refresh / tab close /
  // browser back) so they aren't silently lost. In-app route changes are not
  // blocked here — that needs a react-router data router (tracked separately).
  const hasPendingAIChanges = usePendingDocAI(editor);
  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (!hasPendingAIChanges) return;
        event.preventDefault();
        event.returnValue = '';
      },
      [hasPendingAIChanges]
    )
  );

  useEffect(() => {
    if (!showActionsMenu) {
      setShowExportSubmenu(false);
      return;
    }
    const handleClickOutside = (e: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setShowActionsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showActionsMenu]);

  const handleExport = useCallback(async () => {
    if (!docData || !editor) return;
    try {
      const { DOCXExporter, docxDefaultSchemaMappings } =
        await import('@blocknote/xl-docx-exporter');
      const exporter = new DOCXExporter(editor.schema, docxDefaultSchemaMappings);
      const blob = await exporter.toBlob(editor.document);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${docData.title || 'Dokument'}.docx`;
      link.click();
      window.URL.revokeObjectURL(url);
      setShowActionsMenu(false);
    } catch (error) {
      console.error('Export failed:', error);
    }
  }, [docData, editor]);

  // @blocknote/xl-pdf-exporter and xl-odt-exporter ship no .d.ts in this install,
  // so dynamic-import members are typed as `any`. Scoped disable until upstream types arrive.
  const handleExportPDF = useCallback(async () => {
    if (!docData || !editor) return;
    try {
      const { PDFExporter, pdfDefaultSchemaMappings } = await import('@blocknote/xl-pdf-exporter');
      const { pdf } = await import('@react-pdf/renderer');
      const exporter = new PDFExporter(editor.schema, pdfDefaultSchemaMappings);
      const pdfDocument: Parameters<typeof pdf>[0] = (await exporter.toReactPDFDocument(
        editor.document
      )) as Parameters<typeof pdf>[0];
      const blob = await pdf(pdfDocument).toBlob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${docData.title || 'Dokument'}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
      setShowActionsMenu(false);
    } catch (error) {
      console.error('PDF export failed:', error);
    }
  }, [docData, editor]);

  const handleExportODT = useCallback(async () => {
    if (!docData || !editor) return;
    try {
      const { ODTExporter, odtDefaultSchemaMappings } = await import('@blocknote/xl-odt-exporter');
      const exporter = new ODTExporter(editor.schema, odtDefaultSchemaMappings);
      const blob = await exporter.toODTDocument(editor.document);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${docData.title || 'Dokument'}.odt`;
      link.click();
      window.URL.revokeObjectURL(url);
      setShowActionsMenu(false);
    } catch (error) {
      console.error('ODT export failed:', error);
    }
  }, [docData, editor]);

  const handleSaveToWolke = useCallback(
    async (shareLinkId: string, folderPath: string | undefined, liveSync: boolean) => {
      if (!docData || !editor) throw new Error('Editor not ready');
      const { DOCXExporter, docxDefaultSchemaMappings } =
        await import('@blocknote/xl-docx-exporter');
      const exporter = new DOCXExporter(editor.schema, docxDefaultSchemaMappings);
      const blob = await exporter.toBlob(editor.document);
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Content = btoa(binary);
      const filename = `${docData.title || 'Dokument'}.docx`;
      await uploadToWolke(shareLinkId, base64Content, filename, {
        ...(folderPath ? { folderPath } : {}),
        documentId: docData.id,
        enableLiveSync: liveSync,
      });
      await queryClient.invalidateQueries({ queryKey: ['document', id] });
    },
    [docData, editor, queryClient, id]
  );

  useDocsLiveWolkeSync({ editor, docData, canEdit });

  const togglePanel = useCallback((panel: SidebarPanel) => {
    setActiveSidebar((prev) => (prev === panel ? null : panel));
  }, []);

  useVersionHistoryShortcut(
    activeSidebar !== null,
    activeSidebar ?? 'chat',
    (open) => setActiveSidebar(open ? 'versions' : null),
    (tab) => setActiveSidebar(tab)
  );

  useEffect(() => {
    setCommentsPortalTarget(activeSidebar === 'comments' ? commentsPortalRef.current : null);
  }, [activeSidebar]);

  const initialContent = useMemo(() => docData?.content || '', [docData?.content]);

  const [showDisconnected, setShowDisconnected] = useState(false);
  useEffect(() => {
    if (isConnected) {
      setShowDisconnected(false);
      return;
    }
    const timer = setTimeout(() => setShowDisconnected(true), 5000);
    return () => clearTimeout(timer);
  }, [isConnected]);

  const connectionStatus: 'disconnected' | 'offline-cached' | undefined = showDisconnected
    ? isLocalLoaded
      ? 'offline-cached'
      : 'disconnected'
    : undefined;

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
        <div className="flex-1 max-w-[720px] mx-auto w-full px-md py-lg">
          <Skeleton className="h-8 w-3/4 mb-md" />
          <Skeleton className="h-4 w-full mb-sm" />
          <Skeleton className="h-4 w-5/6 mb-sm" />
          <Skeleton className="h-4 w-4/6 mb-md" />
          <Skeleton className="h-4 w-full mb-sm" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      </div>
    );
  }

  if (docData?.share_mode === 'authenticated' && isGuest) {
    return (
      <div className="flex items-center justify-center h-full flex-col gap-4 text-grey-500">
        <span className="text-foreground-heading font-medium">{docData.title || 'Dokument'}</span>
        <span>Dieses Dokument erfordert eine Anmeldung.</span>
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
        <span>Dokument nicht gefunden oder nicht öffentlich</span>
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
    console.error('[Docs] Guest auth failed, showing error state:', authError);
    return (
      <div className="flex items-center justify-center h-full flex-col gap-4 text-grey-500">
        <span>{getAuthErrorMessage(authError) || 'Verbindung zum Dokument fehlgeschlagen.'}</span>
        <a
          href={`/login?redirectTo=${encodeURIComponent(`/docs/${id}`)}`}
          className="text-secondary-600 underline"
        >
          Anmelden
        </a>
      </div>
    );
  }

  const localUser = getLocalUser();

  const hasLegacyMessages = messages.length > 0;
  const effectivePanel: SidebarPanel | null =
    activeSidebar === 'legacy-chat' && !hasLegacyMessages
      ? 'chat'
      : activeSidebar === 'comments' && commentCount === 0
        ? null
        : activeSidebar;

  return (
    <div className="h-full flex flex-col relative">
      {isEmbedded ? (
        <EditorFAB
          showDisconnected={showDisconnected}
          sidebarOpen={activeSidebar !== null}
          onToggleSidebar={() => setActiveSidebar((prev) => (prev ? null : 'chat'))}
        />
      ) : (
        <EditorTopBar
          title={docData.title}
          connectionStatus={connectionStatus}
          onBack={isGuest ? undefined : () => navigate('/docs')}
          editable={canEdit}
          onTitleChange={handleTitleChange}
          rightActions={
            <>
              {!isGuest && docData.wolke_live_sync && docData.wolke_share_link_id && (
                <button
                  type="button"
                  onClick={() => setShowWolkeModal(true)}
                  className="group relative flex items-center gap-1.5 py-1 px-2 text-[0.75rem] rounded-full text-secondary-700 dark:text-secondary-300 transition-all duration-200 ease-out hover:bg-secondary-100/80 dark:hover:bg-secondary-900/50 hover:scale-105 hover:shadow-[0_0_0_3px_rgba(34,197,94,0.15)] dark:hover:shadow-[0_0_0_3px_rgba(34,197,94,0.25)]"
                  title={
                    docData.wolke_file_path
                      ? `Live mit Wolke synchronisiert: ${docData.wolke_file_path}`
                      : 'Live mit Wolke synchronisiert'
                  }
                  aria-label="Wolke-Live-Sync aktiv"
                >
                  <span className="relative flex items-center justify-center">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-secondary-400/40 opacity-0 group-hover:opacity-100 group-hover:animate-ping" />
                    <FiCloud className="relative h-3.5 w-3.5 transition-transform duration-200 group-hover:scale-110" />
                  </span>
                  <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover:max-w-[3rem] group-hover:opacity-100">
                    Live
                  </span>
                </button>
              )}
              {isGuest && guestIdentity && (
                <GuestBadge
                  guestName={guestIdentity.guestName}
                  guestColor={guestIdentity.guestColor}
                  guestIcon={GUEST_ANIMALS[guestIdentity.guestAnimalIndex].icon}
                  loginUrl={`/login?redirectTo=${encodeURIComponent(`/docs/${id}`)}`}
                />
              )}
              {!isGuest && !canEdit && docData && (
                <div className="flex items-center py-1 px-2.5 text-[0.75rem] rounded-full bg-grey-100/60 dark:bg-grey-800/40 text-grey-600 dark:text-grey-400 border border-grey-200/50 dark:border-grey-700/50">
                  Lesezugriff
                </div>
              )}
              {collaborators.length > 0 && (
                <>
                  <AvatarGroup>
                    {collaborators.slice(0, 5).map((c) => (
                      <Avatar key={c.id} size="sm" title={c.name}>
                        {c.avatarRobotId ? (
                          <AvatarImage src={getRobotAvatarPath(c.avatarRobotId)} alt={c.name} />
                        ) : null}
                        <AvatarFallback style={{ backgroundColor: c.color, color: 'white' }}>
                          {c.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                    {collaborators.length > 5 && (
                      <AvatarGroupCount>+{collaborators.length - 5}</AvatarGroupCount>
                    )}
                  </AvatarGroup>
                </>
              )}

              <button
                className={`glass-btn ${effectivePanel === 'chat' || effectivePanel === 'legacy-chat' ? 'active' : ''}`}
                onClick={() => togglePanel('chat')}
                aria-label="Chat"
                title="Chat"
              >
                <FiMessageSquare />
              </button>

              {!isGuest && commentCount > 0 && (
                <button
                  className={`glass-btn ${effectivePanel === 'comments' ? 'active' : ''}`}
                  onClick={() => togglePanel('comments')}
                  aria-label="Kommentare"
                  title="Kommentare"
                >
                  <FiMessageCircle />
                </button>
              )}

              <button
                ref={actionsButtonRef}
                className="glass-btn"
                onClick={() => {
                  if (showActionsMenu) {
                    setShowActionsMenu(false);
                    return;
                  }
                  const rect = actionsButtonRef.current?.getBoundingClientRect();
                  if (rect) {
                    setActionsMenuRect({
                      top: rect.bottom + 8,
                      right: window.innerWidth - rect.right,
                    });
                  }
                  setShowActionsMenu(true);
                }}
                aria-label="Mehr Aktionen"
                title="Mehr"
              >
                <FiMoreVertical />
              </button>
              {showActionsMenu &&
                actionsMenuRect &&
                createPortal(
                  <div
                    ref={actionsMenuRef}
                    className="fixed min-w-[200px] p-1.5 bg-white/90 dark:bg-grey-900/90 backdrop-blur-xl border border-white/30 dark:border-white/10 rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] z-[1000]"
                    style={{ top: actionsMenuRect.top, right: actionsMenuRect.right }}
                  >
                    {!isGuest && (
                      <>
                        {canEdit && (
                          <button
                            className="flex items-center gap-2.5 w-full py-2 px-3 text-[0.8125rem] text-foreground bg-transparent border-none rounded-lg cursor-pointer text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10 [&_svg]:w-4 [&_svg]:h-4 [&_svg]:text-grey-500"
                            onClick={() => {
                              setShowActionsMenu(false);
                              setShowShareModal(true);
                            }}
                          >
                            <FiShare2 />
                            Teilen
                          </button>
                        )}
                        <button
                          className="flex items-center gap-2.5 w-full py-2 px-3 text-[0.8125rem] text-foreground bg-transparent border-none rounded-lg cursor-pointer text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10 [&_svg]:w-4 [&_svg]:h-4 [&_svg]:text-grey-500"
                          onClick={() => {
                            setShowActionsMenu(false);
                            togglePanel('versions');
                          }}
                        >
                          <FiClock />
                          Versionshistorie
                        </button>
                        {wolkeConnected && (
                          <button
                            className="flex items-center gap-2.5 w-full py-2 px-3 text-[0.8125rem] text-foreground bg-transparent border-none rounded-lg cursor-pointer text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10 [&_svg]:w-4 [&_svg]:h-4 [&_svg]:text-grey-500"
                            onClick={() => {
                              setShowActionsMenu(false);
                              setShowWolkeModal(true);
                            }}
                            title={docData.wolke_file_path ?? undefined}
                          >
                            <FiCloud />
                            <span className="flex-1">In Wolke speichern</span>
                            {docData.wolke_live_sync && (
                              <span className="text-[0.6875rem] text-secondary-600 dark:text-secondary-400 font-medium">
                                Live
                              </span>
                            )}
                          </button>
                        )}
                        <div className="my-1 h-px bg-black/5 dark:bg-white/10" />
                      </>
                    )}
                    <button
                      className="flex items-center gap-2.5 w-full py-2 px-3 text-[0.8125rem] text-foreground bg-transparent border-none rounded-lg cursor-pointer text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10 [&_svg]:w-4 [&_svg]:h-4 [&_svg]:text-grey-500"
                      onClick={() => {
                        // Cycle Hell → Dunkel → System; keep the menu open to click through.
                        cycleTheme();
                      }}
                    >
                      {themePreference === 'light' ? (
                        <PiSun />
                      ) : themePreference === 'dark' ? (
                        <PiMoon />
                      ) : (
                        <PiDesktop />
                      )}
                      {themePreference === 'light'
                        ? 'Heller Modus'
                        : themePreference === 'dark'
                          ? 'Dunkler Modus'
                          : 'System'}
                    </button>
                    <button
                      className="flex items-center gap-2.5 w-full py-2 px-3 text-[0.8125rem] text-foreground bg-transparent border-none rounded-lg cursor-pointer text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10 [&_svg]:w-4 [&_svg]:h-4 [&_svg]:text-grey-500"
                      onClick={() => setShowExportSubmenu((v) => !v)}
                      aria-expanded={showExportSubmenu}
                    >
                      <FiDownload />
                      <span className="flex-1">Exportieren</span>
                      <FiChevronDown
                        className={`!h-3.5 !w-3.5 transition-transform ${showExportSubmenu ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {showExportSubmenu && (
                      <div className="flex flex-col pl-4">
                        <button
                          className="flex items-center gap-2.5 w-full py-2 px-3 text-[0.8125rem] text-foreground bg-transparent border-none rounded-lg cursor-pointer text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10 [&_svg]:w-4 [&_svg]:h-4 [&_svg]:text-grey-500"
                          onClick={handleExport}
                        >
                          Als Word (.docx)
                        </button>
                        <button
                          className="flex items-center gap-2.5 w-full py-2 px-3 text-[0.8125rem] text-foreground bg-transparent border-none rounded-lg cursor-pointer text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10 [&_svg]:w-4 [&_svg]:h-4 [&_svg]:text-grey-500"
                          onClick={handleExportPDF}
                        >
                          Als PDF (.pdf)
                        </button>
                        <button
                          className="flex items-center gap-2.5 w-full py-2 px-3 text-[0.8125rem] text-foreground bg-transparent border-none rounded-lg cursor-pointer text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10 [&_svg]:w-4 [&_svg]:h-4 [&_svg]:text-grey-500"
                          onClick={handleExportODT}
                        >
                          Als ODT (.odt)
                        </button>
                      </div>
                    )}
                  </div>,
                  document.body
                )}
            </>
          }
        />
      )}

      <div className="flex-1 flex flex-row overflow-hidden max-md:flex-col">
        <main className="flex-1 min-w-0 overflow-y-auto scrollbar-thin py-4 px-6 bg-grey-100 dark:bg-grey-900 max-sm:px-0 max-sm:pt-0 max-sm:pb-[var(--mobile-keyboard-offset,0px)] max-sm:bg-background dark:max-sm:bg-background">
          <MemoizedBlockNoteEditor
            documentId={id!}
            initialContent={initialContent}
            documentSubtype={docData.document_subtype}
            ydoc={ydoc}
            provider={provider}
            isSynced={isSynced}
            editable={canEdit}
            commentsPortalTarget={commentsPortalTarget}
            onEditorReady={handleEditorReady}
          />
        </main>

        {hasOpenedChat && id && (
          // Mount the chat infra (runtime, Hocuspocus, thread query) outside
          // the conditional so closing/reopening the panel preserves messages
          // and in-flight streams. The aside is hidden via CSS when the chat
          // panel isn't the active sidebar.
          <aside
            className={
              effectivePanel === 'chat'
                ? 'w-80 min-w-80 max-w-80 flex flex-col border-l border-grey-200 dark:border-grey-700 bg-background dark:bg-grey-900 overflow-hidden max-md:fixed max-md:inset-0 max-md:w-full max-md:min-w-full max-md:max-w-full max-md:border-l-0 max-md:z-[200] max-md:pb-[var(--mobile-keyboard-offset,0px)]'
                : 'hidden'
            }
          >
            <Suspense fallback={null}>
              <DocsChatPanel
                documentId={id}
                userId={user ? String(user.id) : null}
                userName={user?.display_name ?? null}
                documentTitle={docData?.title ?? null}
                isOpen={effectivePanel === 'chat'}
              />
            </Suspense>
            <button
              onClick={() => setActiveSidebar(null)}
              className="hidden max-md:flex absolute top-2 right-2 z-10 h-9 w-9 items-center justify-center rounded-lg bg-background/90 dark:bg-grey-900/90 text-grey-600 hover:bg-grey-100 hover:text-foreground dark:text-grey-300 dark:hover:bg-grey-700 shadow-sm border border-grey-200 dark:border-grey-700"
              aria-label="KI-Chat schließen"
            >
              <FiX size={18} />
            </button>
          </aside>
        )}

        {effectivePanel && effectivePanel !== 'chat' && (
          <aside className="w-80 min-w-80 max-w-80 flex flex-col border-l border-grey-200 dark:border-grey-700 bg-background dark:bg-grey-900 overflow-hidden max-md:fixed max-md:inset-0 max-md:w-full max-md:min-w-full max-md:max-w-full max-md:border-l-0 max-md:z-[200]">
            <div className="py-2 px-3 border-b border-grey-200 dark:border-grey-700 shrink-0 flex items-center gap-2">
              <span className="text-sm font-medium text-foreground flex-1">
                {SIDEBAR_TITLES[effectivePanel]}
              </span>
              {effectivePanel === 'legacy-chat' && (
                <button
                  onClick={() => setActiveSidebar('chat')}
                  className="text-xs text-grey-500 hover:text-foreground underline"
                >
                  KI-Chat
                </button>
              )}
              <button
                onClick={() => setActiveSidebar(null)}
                className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg text-grey-500 hover:bg-grey-100 hover:text-foreground dark:hover:bg-grey-700"
                aria-label="Seitenleiste schließen"
              >
                <FiX size={18} />
              </button>
            </div>

            {effectivePanel === 'legacy-chat' && hasLegacyMessages && (
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="bg-amber-50 dark:bg-amber-950/40 border-l-4 border-amber-400 px-3 py-2 text-sm text-amber-900 dark:text-amber-200 shrink-0">
                  Dieser Chat wurde durch den KI-Assistenten ersetzt. Verlauf bleibt einsehbar; neue
                  Nachrichten bitte im KI-Chat.
                </div>
                <Suspense fallback={null}>
                  <ChatSidebar
                    messages={messages}
                    currentUserId={localUser?.id ?? null}
                    onSend={sendMessage}
                    isConnected={isConnected}
                    hideHeader
                    typingUsers={typingUsers}
                    onTypingChange={setTyping}
                    embedded
                  />
                </Suspense>
              </div>
            )}

            {effectivePanel === 'comments' && (
              <div className="flex-1 overflow-y-auto">
                <div className="p-2" ref={commentsPortalRef} />
              </div>
            )}

            {effectivePanel === 'versions' && id && (
              <VersionHistory
                documentId={id}
                apiClient={apiClient}
                canEdit={canEdit}
                onRestore={(html) => {
                  if (!editor) return;
                  const blocks = editor.tryParseHTMLToBlocks(html);
                  if (blocks && blocks.length > 0) {
                    editor.replaceBlocks(editor.document, blocks);
                  }
                }}
              />
            )}
          </aside>
        )}
      </div>

      {showShareModal && !isGuest && (
        <Suspense fallback={null}>
          <ShareModal
            documentId={id!}
            documentTitle={docData?.title}
            onClose={() => setShowShareModal(false)}
          />
        </Suspense>
      )}

      {!isGuest && (
        <WolkeSaveModal
          open={showWolkeModal}
          onOpenChange={setShowWolkeModal}
          onSave={handleSaveToWolke}
          initialLiveSync={!!docData.wolke_live_sync}
        />
      )}
    </div>
  );
}

export default function DocsEditorPage() {
  return (
    <DocsProvider adapter={webAppDocsAdapter}>
      <ErrorBoundary>
        <EditorContent />
      </ErrorBoundary>
    </DocsProvider>
  );
}
