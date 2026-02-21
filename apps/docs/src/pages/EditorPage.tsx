import {
  useCollaboration,
  useDocumentChat,
  BlockNoteEditor as BlockNoteEditorComponent,
  useDocsAdapter,
  createDocsApiClient,
  type Document,
} from '@gruenerator/docs';
import { EditorTopBar } from '@gruenerator/shared/components/EditorTopBar';
import { MantineProvider, SegmentedControl, ScrollArea } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiDownload, FiShare2, FiSidebar } from 'react-icons/fi';
import { useNavigate, useParams } from 'react-router-dom';

import { useColorScheme } from '../hooks/useColorScheme';
import { useAuthStore } from '../stores/authStore';

import type { BlockNoteEditor } from '@blocknote/core';

import '@mantine/core/styles.css';
import './EditorPage.css';

const ShareModal = lazy(() =>
  import('../components/permissions/ShareModal').then((m) => ({ default: m.ShareModal }))
);
const ChatSidebar = lazy(() =>
  import('@gruenerator/docs').then((m) => ({ default: m.ChatSidebar }))
);

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

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

export const EditorPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const adapter = useDocsAdapter();
  const apiClient = useMemo(() => createDocsApiClient(adapter), [adapter]);
  const user = useAuthStore((state) => state.user);
  const isGuest = !user;

  const guestIdentity = useMemo(() => (isGuest ? getOrCreateGuestIdentity() : null), [isGuest]);

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
    enabled: !!id,
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
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'chat' | 'comments'>('chat');
  const [editor, setEditor] = useState<BlockNoteEditor | null>(null);

  const exportMenuRef = useRef<HTMLDivElement>(null);
  const commentsPortalRef = useRef<HTMLDivElement>(null);
  const [commentsPortalTarget, setCommentsPortalTarget] = useState<HTMLElement | null>(null);
  const { ydoc, provider, isConnected, isSynced } = useCollaboration({
    documentId: id || '',
    user: isGuest ? null : user,
    isGuest,
    guestId: guestIdentity?.guestId,
    guestName: guestIdentity?.guestName,
  });
  const { messages, sendMessage, getLocalUser } = useDocumentChat({ ydoc, provider, isSynced });
  const colorScheme = useColorScheme();

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

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    setCommentsPortalTarget(
      sidebarOpen && sidebarTab === 'comments' ? commentsPortalRef.current : null
    );
  }, [sidebarOpen, sidebarTab]);

  if (docIsLoading) {
    return <div className="loading-container">Lädt...</div>;
  }

  if (!docData) {
    return (
      <div className="error-container" style={{ flexDirection: 'column', gap: '1rem' }}>
        <span>Dokument nicht gefunden oder nicht öffentlich</span>
        {isGuest && (
          <a
            href={`/login?redirectTo=${encodeURIComponent(`/document/${id}`)}`}
            style={{ color: 'var(--secondary-600)', textDecoration: 'underline' }}
          >
            Anmelden
          </a>
        )}
      </div>
    );
  }

  const connectionStatus = !isConnected ? 'disconnected' : !isSynced ? 'syncing' : 'connected';
  const localUser = getLocalUser();

  return (
    <MantineProvider forceColorScheme={colorScheme}>
      <div className="editor-page">
        {isGuest && (
          <div className="guest-banner">
            {canEdit ? 'Du bearbeitest' : 'Du liest'} als Gast ({guestIdentity?.guestName})
            <span className="guest-banner-separator">&middot;</span>
            <a href={`/login?redirectTo=${encodeURIComponent(`/document/${id}`)}`}>Anmelden</a>
          </div>
        )}

        {!isGuest && !canEdit && docData && (
          <div className="guest-banner">Du hast Lesezugriff auf dieses Dokument</div>
        )}

        <EditorTopBar
          title={docData.title}
          connectionStatus={connectionStatus}
          onBack={() => (isGuest ? undefined : navigate('/'))}
          editable={canEdit}
          onTitleChange={handleTitleChange}
          rightActions={
            <>
              {!isGuest && (
                <>
                  <div ref={exportMenuRef} className="dropdown-container">
                    <button
                      className="glass-btn"
                      onClick={() => setShowExportMenu(!showExportMenu)}
                      aria-label="Exportieren"
                    >
                      <FiDownload />
                    </button>
                    {showExportMenu && (
                      <div className="dropdown-menu">
                        <button className="dropdown-item" onClick={handleExport}>
                          <FiDownload />
                          Als Word (.docx)
                        </button>
                        <button className="dropdown-item" onClick={handleExportPDF}>
                          <FiDownload />
                          Als PDF (.pdf)
                        </button>
                        <button className="dropdown-item" onClick={handleExportODT}>
                          <FiDownload />
                          Als ODT (.odt)
                        </button>
                      </div>
                    )}
                  </div>

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

        <div className="editor-content">
          <main className="editor-main">
            <BlockNoteEditorComponent
              documentId={id!}
              initialContent={docData?.content || ''}
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
            <aside className="unified-sidebar">
              <div className="unified-sidebar-header">
                <SegmentedControl
                  value={sidebarTab}
                  onChange={(val) => setSidebarTab(val as 'chat' | 'comments')}
                  data={[
                    { label: 'Chat', value: 'chat' },
                    { label: 'Kommentare', value: 'comments' },
                  ]}
                  size="xs"
                  fullWidth
                />
              </div>

              {sidebarTab === 'chat' && (
                <Suspense fallback={null}>
                  <ChatSidebar
                    messages={messages}
                    currentUserId={localUser?.id ?? null}
                    onSend={sendMessage}
                    isConnected={isConnected}
                    hideHeader
                  />
                </Suspense>
              )}

              {sidebarTab === 'comments' && (
                <ScrollArea style={{ flex: 1 }}>
                  <div className="comments-portal-content" ref={commentsPortalRef} />
                </ScrollArea>
              )}
            </aside>
          )}
        </div>

        {showShareModal && !isGuest && (
          <Suspense fallback={null}>
            <ShareModal documentId={id!} onClose={() => setShowShareModal(false)} />
          </Suspense>
        )}
      </div>
    </MantineProvider>
  );
};
