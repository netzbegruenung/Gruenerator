import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiDownload, FiShare2, FiClock } from 'react-icons/fi';
import { useAuth } from '../hooks/useAuth';
import { useDocumentStore } from '../stores/documentStore';
import { useCollaboration } from '../hooks/useCollaboration';
import { CollaborativeEditor } from '../components/editor/CollaborativeEditor';
import { PresenceAvatars } from '../components/editor/PresenceAvatars';
import { VersionHistory } from '../components/version/VersionHistory';
import { ShareModal } from '../components/permissions/ShareModal';
import { apiClient } from '../lib/apiClient';

export const EditorPage = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [documentData, setDocument] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [editor, setEditor] = useState<any>(null);
  const [darkMode, setDarkMode] = useState(() =>
    document.documentElement.getAttribute('data-theme') === 'dark'
  );
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const { updateDocument } = useDocumentStore();

  // Collaboration state
  const { ydoc, provider, isConnected, isSynced } = useCollaboration(id || '');

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
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export fehlgeschlagen. Bitte versuchen Sie es erneut.');
    }
  };

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: 'var(--font-color-secondary)',
      }}>
        Lädt...
      </div>
    );
  }

  if (!documentData) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: 'var(--font-color-secondary)',
      }}>
        Dokument nicht gefunden
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1rem 2rem',
        borderBottom: '1px solid var(--border-color)',
        backgroundColor: 'var(--background-color)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={() => navigate('/')}
            style={{
              padding: '0',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
            aria-label="Zur Startseite"
          >
            <img
              src={darkMode ? "/images/gruenerator_logo_weiss.svg" : "/images/gruenerator_logo_gruen.svg"}
              alt="Grünerator Logo"
              style={{ height: '32px' }}
            />
          </button>
          <input
            type="text"
            value={documentData.title}
            onChange={(e) => setDocument({ ...documentData, title: e.target.value })}
            onBlur={(e) => handleTitleChange(e.target.value)}
            style={{
              fontSize: '1rem',
              color: 'var(--font-color)',
              fontWeight: 500,
              border: 'none',
              background: 'transparent',
              outline: 'none',
              minWidth: '200px',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div ref={exportMenuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              style={{
                padding: '0.5rem',
                fontSize: '1.25rem',
                color: 'var(--font-color)',
                backgroundColor: 'transparent',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Export"
            >
              <FiDownload />
            </button>
            {showExportMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '0.25rem',
                  backgroundColor: 'var(--card-background)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  boxShadow: 'var(--shadow-lg)',
                  zIndex: 1000,
                  minWidth: '150px',
                }}
              >
                <button
                  onClick={handleExport}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    fontSize: '0.875rem',
                    color: 'var(--font-color)',
                    backgroundColor: 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  📄 Als Word-Dokument (.docx)
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowShareModal(true)}
            style={{
              padding: '0.5rem',
              fontSize: '1.25rem',
              color: 'var(--font-color)',
              backgroundColor: 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Teilen"
          >
            <FiShare2 />
          </button>
          <button
            onClick={() => setShowVersionHistory(true)}
            style={{
              padding: '0.5rem',
              fontSize: '1.25rem',
              color: 'var(--font-color)',
              backgroundColor: 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Versionen"
          >
            <FiClock />
          </button>
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: !isConnected ? '#ef4444' : (!isSynced ? '#f59e0b' : '#10b981'),
            }}
            title={!isConnected ? 'Getrennt' : (!isSynced ? 'Synchronisiert...' : 'Verbunden')}
          />
          <PresenceAvatars provider={provider} />
          <span style={{
            fontSize: '0.9rem',
            color: 'var(--font-color-secondary)',
          }}>
            {user?.display_name}
          </span>
        </div>
      </header>

      <main style={{ flex: 1, overflow: 'hidden' }}>
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
    </div>
  );
};
