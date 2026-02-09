import { MantineProvider } from '@mantine/core';
import { useEffect, useState, useRef, useCallback } from 'react';
import { FiDownload, FiMessageSquare, FiUsers } from 'react-icons/fi';
import { useParams } from 'react-router-dom';

import '@mantine/core/styles.css';
import { useAuthStore } from '../../stores/authStore';

import { webAppDocsAdapter } from './docsAdapter';

import type { BlockNoteEditor } from '@blocknote/core';

import { DOCXExporter, docxDefaultSchemaMappings } from '@blocknote/xl-docx-exporter';
import {
  DocsProvider,
  useDocumentStore,
  useCollaboration,
  useDocumentChat,
  BlockNoteEditor as BlockNoteEditorComponent,
  ChatSidebar,
  useDocsAdapter,
  createDocsApiClient,
  ErrorBoundary,
} from '@gruenerator/docs';
import '@gruenerator/docs/styles';

function EditorContent() {
  const { id } = useParams<{ id: string }>();
  const adapter = useDocsAdapter();
  const apiClient = createDocsApiClient(adapter);
  const user = useAuthStore((s) => s.user);

  const [docState, setDocState] = useState<{ data: any; isLoading: boolean }>({
    data: null,
    isLoading: true,
  });
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showCommentsSidebar, setShowCommentsSidebar] = useState(false);
  const [showChatSidebar, setShowChatSidebar] = useState(false);
  const [editor, setEditor] = useState<BlockNoteEditor | null>(null);

  const exportMenuRef = useRef<HTMLDivElement>(null);
  const { updateDocument } = useDocumentStore();

  const collaborationUser = user
    ? { id: String(user.id), display_name: user.display_name, email: user.email }
    : null;

  const { ydoc, provider, isConnected, isSynced } = useCollaboration({
    documentId: id || '',
    user: collaborationUser,
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

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const fetchDocument = async () => {
      try {
        const data = await apiClient.get(`/docs/${id}`);
        if (!cancelled) setDocState({ data, isLoading: false });
      } catch {
        if (!cancelled) setDocState({ data: null, isLoading: false });
      }
    };

    fetchDocument();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleExport = useCallback(async () => {
    if (!docState.data || !editor) return;
    try {
      const exporter = new DOCXExporter(editor.schema, docxDefaultSchemaMappings);
      const blob = await exporter.toBlob(editor.document);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${docState.data.title || 'Dokument'}.docx`;
      link.click();
      window.URL.revokeObjectURL(url);
      setShowExportMenu(false);
    } catch (error) {
      console.error('Export failed:', error);
    }
  }, [docState.data, editor]);

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

  if (docState.isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>Lädt...</div>
    );
  }

  if (!docState.data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        Dokument nicht gefunden
      </div>
    );
  }

  const connectionStatus = !isConnected ? 'disconnected' : !isSynced ? 'syncing' : 'connected';
  const localUser = getLocalUser();

  return (
    <div className="editor-page">
      <div className="editor-content">
        <main className="editor-main">
          <BlockNoteEditorComponent
            documentId={id!}
            initialContent={docState.data.content || ''}
            documentSubtype={docState.data.document_subtype}
            ydoc={ydoc}
            provider={provider}
            isSynced={isSynced}
            showCommentsSidebar={showCommentsSidebar}
            onEditorReady={handleEditorReady}
          />
        </main>

        {showChatSidebar && (
          <ChatSidebar
            messages={messages}
            currentUserId={localUser?.id ?? null}
            onSend={sendMessage}
            isConnected={isConnected}
          />
        )}
      </div>

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
      </div>

      <div className="floating-panel floating-panel--bottom">
        <button
          className={`glass-btn ${showCommentsSidebar ? 'active' : ''}`}
          onClick={toggleComments}
          aria-label="Kommentare"
        >
          <FiMessageSquare />
        </button>
        <button
          className={`glass-btn ${showChatSidebar ? 'active' : ''}`}
          onClick={toggleChat}
          aria-label="Chat"
        >
          <FiUsers />
        </button>
      </div>
    </div>
  );
}

export default function DocsEditorPage() {
  return (
    <MantineProvider>
      <DocsProvider adapter={webAppDocsAdapter}>
        <ErrorBoundary>
          <EditorContent />
        </ErrorBoundary>
      </DocsProvider>
    </MantineProvider>
  );
}
