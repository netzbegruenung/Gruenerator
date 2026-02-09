import {
  useCollaboration,
  useDocumentChat,
  BlockNoteEditor as BlockNoteEditorComponent,
  useDocsAdapter,
  createDocsApiClient,
} from '@gruenerator/docs';
import { MantineProvider } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiDownload, FiShare2, FiClock, FiMessageSquare, FiUsers } from 'react-icons/fi';
import { useParams } from 'react-router-dom';

import { useAuthStore } from '../stores/authStore';

import type { BlockNoteEditor } from '@blocknote/core';

import '@mantine/core/styles.css';
import './EditorPage.css';

const VersionHistory = lazy(() =>
  import('@gruenerator/shared/tiptap-editor').then((m) => ({ default: m.VersionHistory }))
);
const ShareModal = lazy(() =>
  import('@gruenerator/shared/tiptap-editor').then((m) => ({ default: m.ShareModal }))
);
const ChatSidebar = lazy(() =>
  import('@gruenerator/docs').then((m) => ({ default: m.ChatSidebar }))
);

export const EditorPage = () => {
  const { id } = useParams<{ id: string }>();
  const adapter = useDocsAdapter();
  const apiClient = useMemo(() => createDocsApiClient(adapter), [adapter]);
  const user = useAuthStore((state) => state.user);

  const { data: docData, isLoading: docIsLoading } = useQuery({
    queryKey: ['document', id],
    queryFn: () => apiClient.get<any>(`/docs/${id}`),
    enabled: !!id,
  });
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showCommentsSidebar, setShowCommentsSidebar] = useState(false);
  const [showChatSidebar, setShowChatSidebar] = useState(false);
  const [editor, setEditor] = useState<BlockNoteEditor | null>(null);

  const exportMenuRef = useRef<HTMLDivElement>(null);
  const { ydoc, provider, isConnected, isSynced } = useCollaboration({
    documentId: id || '',
    user,
  });
  const { messages, sendMessage, getLocalUser } = useDocumentChat({ ydoc, provider, isSynced });

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

  const toggleComments = useCallback(() => {
    setShowCommentsSidebar((prev) => {
      const next = !prev;
      if (next) setShowChatSidebar(false);
      return next;
    });
  }, []);

  const toggleChat = useCallback(() => {
    setShowChatSidebar((prev) => {
      const next = !prev;
      if (next) setShowCommentsSidebar(false);
      return next;
    });
  }, []);

  if (docIsLoading) {
    return <div className="loading-container">Lädt...</div>;
  }

  if (!docData) {
    return <div className="error-container">Dokument nicht gefunden</div>;
  }

  const connectionStatus = !isConnected ? 'disconnected' : !isSynced ? 'syncing' : 'connected';

  const localUser = getLocalUser();

  return (
    <MantineProvider>
      <div className="editor-page">
        <div className="editor-content">
          <main className="editor-main">
            <BlockNoteEditorComponent
              documentId={id!}
              initialContent={docData?.content || ''}
              documentSubtype={docData.document_subtype}
              ydoc={ydoc}
              provider={provider}
              isSynced={isSynced}
              showCommentsSidebar={showCommentsSidebar}
              onEditorReady={handleEditorReady}
            />
          </main>

          {showChatSidebar && (
            <Suspense fallback={null}>
              <ChatSidebar
                messages={messages}
                currentUserId={localUser?.id ?? null}
                onSend={sendMessage}
                isConnected={isConnected}
              />
            </Suspense>
          )}
        </div>

        {/* Utility toolbar - top right */}
        <div className="floating-panel floating-panel--top">
          <div className={`status-dot ${connectionStatus}`} />

          <span className="glass-divider" />

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
              </div>
            )}
          </div>

          <button className="glass-btn" onClick={() => setShowShareModal(true)} aria-label="Teilen">
            <FiShare2 />
          </button>

          <button
            className="glass-btn"
            onClick={() => setShowVersionHistory(true)}
            aria-label="Versionen"
          >
            <FiClock />
          </button>
        </div>

        {/* Sidebar toggles - bottom right */}
        <div className="floating-panel floating-panel--bottom">
          <button
            className={`glass-btn ${showCommentsSidebar ? 'active' : ''}`}
            onClick={toggleComments}
            aria-label="Kommentare"
            title="Kommentare anzeigen"
          >
            <FiMessageSquare />
          </button>

          <button
            className={`glass-btn ${showChatSidebar ? 'active' : ''}`}
            onClick={toggleChat}
            aria-label="Chat"
            title="Chat anzeigen"
          >
            <FiUsers />
          </button>
        </div>

        {/* Modals */}
        {showVersionHistory && (
          <Suspense fallback={null}>
            <VersionHistory
              documentId={id!}
              onClose={() => setShowVersionHistory(false)}
              onRestore={() => window.location.reload()}
            />
          </Suspense>
        )}

        {showShareModal && (
          <Suspense fallback={null}>
            <ShareModal documentId={id!} onClose={() => setShowShareModal(false)} />
          </Suspense>
        )}
      </div>
    </MantineProvider>
  );
};
