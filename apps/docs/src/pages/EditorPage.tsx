import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiDownload, FiShare2, FiClock, FiChevronLeft, FiMoreVertical, FiUsers } from 'react-icons/fi';
import { useAuth } from '../hooks/useAuth';
import { useDocumentStore } from '../stores/documentStore';
import { useCollaboration, useCollaborators } from '../hooks/useCollaboration';
import { CollaborativeEditor } from '../components/editor/CollaborativeEditor';
import {
  PresenceAvatars,
  VersionHistory,
  ShareModal,
  ActionSheet,
  ActionSheetItem,
  ActionSheetDivider,
} from '@gruenerator/shared/tiptap-editor';
import { apiClient } from '../lib/apiClient';
import './EditorPage.css';

export const EditorPage = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [documentData, setDocument] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [editor, setEditor] = useState<any>(null);
  const [darkMode, setDarkMode] = useState(() =>
    document.documentElement.getAttribute('data-theme') === 'dark'
  );
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const { updateDocument } = useDocumentStore();

  // Collaboration state
  const { ydoc, provider, isConnected, isSynced } = useCollaboration(id || '');
  const collaborators = useCollaborators(provider);

  // Listen for theme changes
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-theme') {
          setDarkMode(document.documentElement.getAttribute('data-theme') === 'dark');
        }
      });
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // Close export menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };

    if (showExportMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showExportMenu]);

  useEffect(() => {
    const fetchDocument = async () => {
      if (!id) return;

      try {
        setIsLoading(true);
        const response = await apiClient.get(`/docs/${id}`);
        setDocument(response.data);
      } catch (error) {
        console.error('Failed to fetch documentData:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDocument();
  }, [id]);


  const handleTitleChange = async (newTitle: string) => {
    if (!id || !newTitle.trim()) return;

    try {
      await updateDocument(id, { title: newTitle });
      setDocument((prev: any) => ({ ...prev, title: newTitle }));
    } catch (error) {
      console.error('Failed to update title:', error);
    }
  };

  const handleExport = async () => {
    if (!documentData) return;

    try {
      // Get current content from Tiptap editor (if available), otherwise use stored content
      const content = editor ? editor.getHTML() : documentData.content || '';

      // Make POST request to DOCX export endpoint
      const response = await apiClient.post('/exports/docx', {
        content: content,
        title: documentData.title,
      }, {
        responseType: 'blob'
      });

      // Create download link
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${documentData.title || 'Dokument'}.docx`;
      link.click();
      window.URL.revokeObjectURL(url);

      setShowExportMenu(false);
      setShowActionSheet(false);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export fehlgeschlagen. Bitte versuchen Sie es erneut.');
    }
  };

  const handleShareFromActionSheet = () => {
    setShowActionSheet(false);
    setShowShareModal(true);
  };

  const handleVersionHistoryFromActionSheet = () => {
    setShowActionSheet(false);
    setShowVersionHistory(true);
  };

  if (isLoading) {
    return <div className="loading-container">Lädt...</div>;
  }

  if (!documentData) {
    return <div className="error-container">Dokument nicht gefunden</div>;
  }

  const connectionStatus = !isConnected ? 'disconnected' : (!isSynced ? 'syncing' : 'connected');
  const connectionTitle = !isConnected ? 'Getrennt' : (!isSynced ? 'Synchronisiert...' : 'Verbunden');
  const collaboratorCount = collaborators.length;

  return (
    <div className="editor-page">
      <header className="editor-page-header">
        <div className="header-left">
          {/* Mobile: Back button */}
          <button
            onClick={() => navigate('/')}
            className="back-button mobile-only"
            aria-label="Zurück"
          >
            <FiChevronLeft />
          </button>

          {/* Desktop: Logo */}
          <button
            onClick={() => navigate('/')}
            className="logo-button desktop-only"
            aria-label="Zur Startseite"
          >
            <img
              src={darkMode ? "/images/gruenerator_logo_weiss.svg" : "/images/gruenerator_logo_gruen.svg"}
              alt="Grünerator Logo"
            />
          </button>

          <input
            type="text"
            value={documentData.title}
            onChange={(e) => setDocument({ ...documentData, title: e.target.value })}
            onBlur={(e) => handleTitleChange(e.target.value)}
            className="title-input"
            aria-label="Dokumenttitel"
          />

          {/* Mobile: Connection indicator inline with title */}
          <div
            className={`connection-indicator mobile-only ${connectionStatus}`}
            title={connectionTitle}
          />
        </div>

        <div className="header-right">
          {/* Desktop: All buttons visible */}
          <div ref={exportMenuRef} className="export-menu-container desktop-only">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="header-button"
              title="Export"
              aria-label="Exportieren"
            >
              <FiDownload />
            </button>
            {showExportMenu && (
              <div className="export-menu">
                <button onClick={handleExport} className="export-menu-button">
                  📄 Als Word-Dokument (.docx)
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => setShowShareModal(true)}
            className="header-button desktop-only"
            title="Teilen"
            aria-label="Teilen"
          >
            <FiShare2 />
          </button>

          <button
            onClick={() => setShowVersionHistory(true)}
            className="header-button desktop-only"
            title="Versionen"
            aria-label="Versionen"
          >
            <FiClock />
          </button>

          <div
            className={`connection-indicator desktop-only ${connectionStatus}`}
            title={connectionTitle}
          />

          <div className="desktop-only">
            <PresenceAvatars provider={provider} />
          </div>

          <span className="user-name desktop-only">{user?.display_name}</span>

          {/* Mobile: Overflow menu button */}
          <button
            onClick={() => setShowActionSheet(true)}
            className="overflow-menu-button mobile-only"
            aria-label="Weitere Aktionen"
          >
            <FiMoreVertical />
          </button>
        </div>
      </header>

      <main className="editor-main">
        <CollaborativeEditor
          documentId={id!}
          initialContent={documentData.content || ''}
          ydoc={ydoc}
          provider={provider}
          onEditorReady={(editorInstance) => setEditor(editorInstance)}
        />
      </main>

      {showVersionHistory && (
        <VersionHistory
          documentId={id!}
          onClose={() => setShowVersionHistory(false)}
          onRestore={() => {
            // Reload the page to get the restored content
            window.location.reload();
          }}
        />
      )}

      {showShareModal && (
        <ShareModal
          documentId={id!}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {/* Mobile Action Sheet */}
      <ActionSheet
        isOpen={showActionSheet}
        onClose={() => setShowActionSheet(false)}
        title="Aktionen"
      >
        <ActionSheetItem
          icon={FiDownload}
          label="Exportieren"
          description="Als Word-Dokument speichern"
          onClick={handleExport}
        />
        <ActionSheetItem
          icon={FiShare2}
          label="Teilen"
          description="Link teilen oder Berechtigungen verwalten"
          onClick={handleShareFromActionSheet}
        />
        <ActionSheetItem
          icon={FiClock}
          label="Versionen"
          description="Frühere Versionen anzeigen"
          onClick={handleVersionHistoryFromActionSheet}
        />
        {collaboratorCount > 0 && (
          <>
            <ActionSheetDivider />
            <ActionSheetItem
              icon={FiUsers}
              label="Mitarbeitende"
              badge={`${collaboratorCount}`}
              onClick={() => setShowActionSheet(false)}
            />
          </>
        )}
      </ActionSheet>
    </div>
  );
};
