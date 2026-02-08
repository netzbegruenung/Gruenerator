import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { FiDownload, FiShare2, FiMessageSquare, FiUsers } from 'react-icons/fi';
import type { BlockNoteEditor } from '@blocknote/core';
import { DOCXExporter, docxDefaultSchemaMappings } from '@blocknote/xl-docx-exporter';
import {
  useDocumentStore,
  useCollaboration,
  useDocumentChat,
  BlockNoteEditor as BlockNoteEditorComponent,
  ChatSidebar,
  useDocsAdapter,
  createDocsApiClient,
} from '@gruenerator/docs';
import type { DocsCapacitorUser } from '../auth/capacitorAuth';

interface DocumentState {
  data: any;
  isLoading: boolean;
}

interface EditorPageProps {
  user: DocsCapacitorUser;
}

export const EditorPage = ({ user }: EditorPageProps) => {
  const { id } = useParams<{ id: string }>();
  const adapter = useDocsAdapter();
  const apiClient = createDocsApiClient(adapter);

  const [docState, setDocState] = useState<DocumentState>({ data: null, isLoading: true });
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showCommentsSidebar, setShowCommentsSidebar] = useState(false);
  const [showChatSidebar, setShowChatSidebar] = useState(false);
  const [editor, setEditor] = useState<BlockNoteEditor | null>(null);

  const exportMenuRef = useRef<HTMLDivElement>(null);
  const { updateDocument } = useDocumentStore();

  const collaborationUser: { id: string; display_name?: string; email?: string } | null = user
    ? {
        id: user.id,
        display_name: user.display_name,
        email: user.email,
      }
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
      } catch (error) {
        console.error('Failed to fetch document:', error);
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
    return <div className="loading-container">Lädt...</div>;
  }

  if (!docState.data) {
    return <div className="error-container">Dokument nicht gefunden</div>;
  }

  const connectionStatus = !isConnected ? 'disconnected' : !isSynced ? 'syncing' : 'connected';
  const localUser = getLocalUser();

  return (
    <div className="editor-page">
      <div className="editor-content">
        <main className="editor-main">
          <BlockNoteEditorComponent
            documentId={id!}
            initialContent=""
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

      {/* Toolbar */}
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

        <button className="glass-btn" onClick={() => adapter.navigateToHome()} aria-label="Zurück">
          <FiShare2 />
        </button>
      </div>

      {/* Sidebar toggles */}
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
};
