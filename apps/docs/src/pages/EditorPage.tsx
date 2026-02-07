import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { FiDownload, FiShare2, FiClock, FiMessageSquare } from 'react-icons/fi';
import type { BlockNoteEditor } from '@blocknote/core';
import { DOCXExporter, docxDefaultSchemaMappings } from '@blocknote/xl-docx-exporter';
import { useDocumentStore } from '../stores/documentStore';
import { useCollaboration } from '../hooks/useCollaboration';
import { BlockNoteEditor as BlockNoteEditorComponent } from '../components/editor/BlockNoteEditor';
import { VersionHistory, ShareModal } from '@gruenerator/shared/tiptap-editor';
import { apiClient } from '../lib/apiClient';
import './EditorPage.css';

interface DocumentState {
  data: any;
  isLoading: boolean;
}

export const EditorPage = () => {
  const { id } = useParams<{ id: string }>();

  const [docState, setDocState] = useState<DocumentState>({ data: null, isLoading: true });
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showCommentsSidebar, setShowCommentsSidebar] = useState(false);
  const [editor, setEditor] = useState<BlockNoteEditor | null>(null);

  const exportMenuRef = useRef<HTMLDivElement>(null);
  const { updateDocument } = useDocumentStore();
  const { ydoc, provider, isConnected, isSynced } = useCollaboration(id || '');

  const handleEditorReady = useCallback((editorInstance: BlockNoteEditor) => {
    setEditor(editorInstance);
  }, []);

  // Close export menu on outside click
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

  // Fetch document
  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    const fetchDocument = async () => {
      try {
        const response = await apiClient.get(`/docs/${id}`);
        if (!cancelled) {
          setDocState({ data: response.data, isLoading: false });
        }
      } catch (error) {
        console.error('Failed to fetch document:', error);
        if (!cancelled) {
          setDocState({ data: null, isLoading: false });
        }
      }
    };

    fetchDocument();
    return () => { cancelled = true; };
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

  if (docState.isLoading) {
    return <div className="loading-container">Lädt...</div>;
  }

  if (!docState.data) {
    return <div className="error-container">Dokument nicht gefunden</div>;
  }

  const connectionStatus = !isConnected ? 'disconnected' : !isSynced ? 'syncing' : 'connected';

  return (
    <div className="editor-page">
      <main className="editor-main">
        <BlockNoteEditorComponent
          documentId={id!}
          initialContent={docState.data.content || ''}
          ydoc={ydoc}
          provider={provider}
          showCommentsSidebar={showCommentsSidebar}
          onEditorReady={handleEditorReady}
        />
      </main>

      {/* Floating toolbar - bottom right */}
      <div className="floating-panel">
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

        <button
          className="glass-btn"
          onClick={() => setShowShareModal(true)}
          aria-label="Teilen"
        >
          <FiShare2 />
        </button>

        <button
          className="glass-btn"
          onClick={() => setShowVersionHistory(true)}
          aria-label="Versionen"
        >
          <FiClock />
        </button>

        <button
          className={`glass-btn ${showCommentsSidebar ? 'active' : ''}`}
          onClick={() => setShowCommentsSidebar(!showCommentsSidebar)}
          aria-label="Kommentare"
          title="Kommentare anzeigen"
        >
          <FiMessageSquare />
        </button>
      </div>

      {/* Modals */}
      {showVersionHistory && (
        <VersionHistory
          documentId={id!}
          onClose={() => setShowVersionHistory(false)}
          onRestore={() => window.location.reload()}
        />
      )}

      {showShareModal && (
        <ShareModal
          documentId={id!}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </div>
  );
};
