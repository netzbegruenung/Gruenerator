import { useCollaboration, type CollaborationConfig } from '@gruenerator/collab';
import {
  DocsProvider,
  useDocumentChat,
  BlockNoteEditor as BlockNoteEditorComponent,
  useDocsAdapter,
  createDocsApiClient,
  lazyWithRetry,
  ErrorBoundary,
  type Document,
} from '@gruenerator/docs';
import { EditorTopBar } from '@gruenerator/shared/components/EditorTopBar';
import { WolkeSaveModal, uploadToWolke } from '@gruenerator/wolke';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { FiCloud, FiDownload, FiShare2, FiSidebar } from 'react-icons/fi';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useCollaborationConfig } from '../../hooks/useCollaborationConfig';
import { useAuthStore } from '../../stores/authStore';

import { webAppDocsAdapter } from './docsAdapter';

import type { BlockNoteEditor } from '@blocknote/core';

const MemoizedBlockNoteEditor = memo(BlockNoteEditorComponent);

const ShareModal = lazyWithRetry(() =>
  import('@gruenerator/docs').then((m) => ({ default: m.ShareModal }))
);
const ChatSidebar = lazyWithRetry(() =>
  import('@gruenerator/docs').then((m) => ({ default: m.ChatSidebar }))
);

const GUEST_ANIMAL_NAMES = [
  'Eichhörnchen',
  'Igel',
  'Fuchs',
  'Reh',
  'Dachs',
  'Hase',
  'Eule',
  'Specht',
  'Otter',
  'Biber',
  'Falke',
  'Luchs',
  'Marder',
  'Drossel',
];

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

function getOrCreateGuestIdentity(): { guestId: string; guestName: string; guestColor: string } {
  const stored = localStorage.getItem('docs-guest-identity');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      /* regenerate */
    }
  }

  const identity = {
    guestId: `guest-${crypto.randomUUID().slice(0, 8)}`,
    guestName: GUEST_ANIMAL_NAMES[Math.floor(Math.random() * GUEST_ANIMAL_NAMES.length)],
    guestColor: GUEST_COLORS[Math.floor(Math.random() * GUEST_COLORS.length)],
  };

  localStorage.setItem('docs-guest-identity', JSON.stringify(identity));
  return identity;
}

const SIDEBAR_TABS = [
  { label: 'Chat', value: 'chat' as const },
  { label: 'Kommentare', value: 'comments' as const },
];

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
  const user = useAuthStore((s) => s.user);
  const isAuthLoading = useAuthStore((s) => s.isLoading);
  const isGuest = !user;

  const guestIdentity = useMemo(() => (isGuest ? getOrCreateGuestIdentity() : null), [isGuest]);

  const API_BASE = useMemo(() => adapter.getApiBaseUrl(), [adapter]);

  const { data: docData, isLoading: docIsLoading } = useQuery({
    queryKey: ['document', id, isGuest ? 'public' : 'auth'],
    queryFn: async () => {
      if (isGuest) {
        const res = await fetch(`${API_BASE}/docs/public/${id}`);
        if (!res.ok) return null;
        return res.json();
      }
      return apiClient.get<Document>(`/docs/${id}`);
    },
    enabled: !!id && !isAuthLoading,
  });

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
      const queryKey = ['document', id, isGuest ? 'public' : 'auth'];
      queryClient.setQueryData(queryKey, (old: Document | undefined) =>
        old ? { ...old, title: newTitle } : old
      );
      document.title = newTitle;
      try {
        await apiClient.put(`/docs/${id}`, { title: newTitle });
      } catch {
        queryClient.setQueryData(queryKey, docData);
      }
    },
    [id, isGuest, apiClient, queryClient, docData]
  );

  const [showShareModal, setShowShareModal] = useState(false);
  const [showWolkeModal, setShowWolkeModal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'chat' | 'comments'>('chat');
  const [editor, setEditor] = useState<BlockNoteEditor | null>(null);

  const exportMenuRef = useRef<HTMLDivElement>(null);
  const commentsPortalRef = useRef<HTMLDivElement>(null);
  const [commentsPortalTarget, setCommentsPortalTarget] = useState<HTMLElement | null>(null);

  const collabConfig = useCollaborationConfig();
  const { ydoc, provider, isConnected, isSynced } = useCollaboration({
    documentId: id || '',
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
  const { messages, sendMessage, getLocalUser, setTyping, typingUsers } = useDocumentChat({
    ydoc,
    provider,
    isSynced,
  });

  const handleEditorReady = useCallback((editorInstance: BlockNoteEditor) => {
    setEditor(editorInstance);
  }, []);

  useEffect(() => {
    if (!showExportMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showExportMenu]);

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
      setShowExportMenu(false);
    } catch (error) {
      console.error('Export failed:', error);
    }
  }, [docData, editor]);

  const handleExportPDF = useCallback(async () => {
    if (!docData || !editor) return;
    try {
      const { PDFExporter, pdfDefaultSchemaMappings } = await import('@blocknote/xl-pdf-exporter');
      const { pdf } = await import('@react-pdf/renderer');
      const exporter = new PDFExporter(editor.schema, pdfDefaultSchemaMappings);
      const pdfDocument = await exporter.toReactPDFDocument(editor.document);
      const blob = await pdf(pdfDocument).toBlob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${docData.title || 'Dokument'}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
      setShowExportMenu(false);
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
      setShowExportMenu(false);
    } catch (error) {
      console.error('ODT export failed:', error);
    }
  }, [docData, editor]);

  const handleSaveToWolke = useCallback(
    async (shareLinkId: string, folderPath?: string) => {
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
      await uploadToWolke(shareLinkId, base64Content, filename, folderPath);
    },
    [docData, editor]
  );

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    setCommentsPortalTarget(
      sidebarOpen && sidebarTab === 'comments' ? commentsPortalRef.current : null
    );
  }, [sidebarOpen, sidebarTab]);

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

  const connectionStatus: 'disconnected' | undefined = showDisconnected
    ? 'disconnected'
    : undefined;

  if (docIsLoading) {
    return <div className="flex items-center justify-center h-full" />;
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
  const localUser = getLocalUser();

  return (
    <div className="h-full flex flex-col relative">
      {isGuest && (
        <div className="flex items-center justify-center gap-1 py-2 px-4 text-[0.8125rem] text-grey-700 dark:text-grey-300 bg-secondary-100/50 dark:bg-secondary-600/15 border-b border-secondary-200/50 dark:border-secondary-600/25">
          {canEdit ? 'Du bearbeitest' : 'Du liest'} als Gast ({guestIdentity?.guestName})
          <span className="mx-1">&middot;</span>
          <a
            href={`/login?redirectTo=${encodeURIComponent(`/docs/${id}`)}`}
            className="text-secondary-700 dark:text-secondary-400 underline font-medium"
          >
            Anmelden
          </a>
        </div>
      )}

      {!isGuest && !canEdit && docData && (
        <div className="flex items-center justify-center gap-1 py-2 px-4 text-[0.8125rem] text-grey-700 dark:text-grey-300 bg-secondary-100/50 dark:bg-secondary-600/15 border-b border-secondary-200/50 dark:border-secondary-600/25">
          Du hast Lesezugriff auf dieses Dokument
        </div>
      )}

      {isEmbedded ? (
        <EditorFAB
          showDisconnected={showDisconnected}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={toggleSidebar}
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
              {!isGuest && (
                <>
                  <div ref={exportMenuRef} className="relative">
                    <button
                      className="glass-btn"
                      onClick={() => setShowExportMenu(!showExportMenu)}
                      aria-label="Exportieren"
                    >
                      <FiDownload />
                    </button>
                    {showExportMenu && (
                      <div className="absolute top-[calc(100%+0.5rem)] right-0 min-w-[180px] p-1.5 bg-white/90 dark:bg-grey-900/90 backdrop-blur-xl border border-white/30 dark:border-white/10 rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] z-[100]">
                        <button
                          className="flex items-center gap-2.5 w-full py-2 px-3 text-[0.8125rem] text-foreground bg-transparent border-none rounded-lg cursor-pointer text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10 [&_svg]:w-4 [&_svg]:h-4 [&_svg]:text-grey-500"
                          onClick={handleExport}
                        >
                          <FiDownload />
                          Als Word (.docx)
                        </button>
                        <button
                          className="flex items-center gap-2.5 w-full py-2 px-3 text-[0.8125rem] text-foreground bg-transparent border-none rounded-lg cursor-pointer text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10 [&_svg]:w-4 [&_svg]:h-4 [&_svg]:text-grey-500"
                          onClick={handleExportPDF}
                        >
                          <FiDownload />
                          Als PDF (.pdf)
                        </button>
                        <button
                          className="flex items-center gap-2.5 w-full py-2 px-3 text-[0.8125rem] text-foreground bg-transparent border-none rounded-lg cursor-pointer text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10 [&_svg]:w-4 [&_svg]:h-4 [&_svg]:text-grey-500"
                          onClick={handleExportODT}
                        >
                          <FiDownload />
                          Als ODT (.odt)
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    className="glass-btn"
                    onClick={() => setShowWolkeModal(true)}
                    aria-label="In Wolke speichern"
                    title="In Wolke speichern"
                  >
                    <FiCloud />
                  </button>

                  {canEdit && (
                    <button
                      className="glass-btn"
                      onClick={() => setShowShareModal(true)}
                      aria-label="Teilen"
                    >
                      <FiShare2 />
                    </button>
                  )}

                  <span className="glass-divider" />
                </>
              )}

              <button
                className={`glass-btn ${sidebarOpen ? 'active' : ''}`}
                onClick={toggleSidebar}
                aria-label="Seitenleiste"
                title="Seitenleiste ein-/ausblenden"
              >
                <FiSidebar />
              </button>
            </>
          }
        />
      )}

      <div className="flex-1 flex flex-row overflow-hidden max-md:flex-col">
        <main className="flex-1 min-w-0 overflow-y-auto py-4 px-6 bg-grey-100 dark:bg-grey-900 max-sm:px-0 max-sm:pt-0 max-sm:bg-background dark:max-sm:bg-background">
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

        {sidebarOpen && (
          <aside className="w-80 min-w-80 max-w-80 flex flex-col border-l border-grey-200 dark:border-grey-700 bg-background dark:bg-grey-900 overflow-hidden max-md:fixed max-md:inset-0 max-md:w-full max-md:min-w-full max-md:max-w-full max-md:border-l-0 max-md:z-[200]">
            <div className="py-2 px-3 border-b border-grey-200 dark:border-grey-700 shrink-0">
              <div className="flex items-center gap-2">
                <div className="inline-flex flex-1 rounded-lg bg-grey-100 p-0.5 dark:bg-grey-800">
                  {SIDEBAR_TABS.map((tab) => (
                    <button
                      key={tab.value}
                      onClick={() => setSidebarTab(tab.value)}
                      className={`flex-1 rounded-md px-3 py-1 text-xs font-medium transition-all ${
                        sidebarTab === tab.value
                          ? 'bg-background-pure text-foreground shadow-sm'
                          : 'text-grey-500 hover:text-grey-700 dark:text-grey-400 dark:hover:text-grey-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="hidden max-md:flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-grey-500 hover:bg-grey-100 hover:text-foreground dark:hover:bg-grey-700"
                  aria-label="Seitenleiste schließen"
                >
                  ✕
                </button>
              </div>
            </div>

            {sidebarTab === 'chat' && (
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
            )}

            {sidebarTab === 'comments' && (
              <div className="flex-1 overflow-y-auto">
                <div className="p-2" ref={commentsPortalRef} />
              </div>
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
