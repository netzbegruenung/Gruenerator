import { useState, useEffect } from 'react';
import { apiClient } from '../../lib/apiClient';
import './ShareModal.css';

interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string;
}

interface Collaborator {
  user_id: string;
  display_name: string;
  email: string;
  avatar_url?: string;
  permission_level: 'owner' | 'editor' | 'viewer';
  granted_at: string;
  granted_by?: string;
}

interface ShareModalProps {
  documentId: string;
  onClose: () => void;
}

export const ShareModal = ({ documentId, onClose }: ShareModalProps) => {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    fetchCollaborators();
  }, [documentId]);

  const fetchCollaborators = async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.get(`/docs/${documentId}/permissions`);
      setCollaborators(response.data);
      setError(null);
    } catch (error) {
      console.error('Failed to fetch collaborators:', error);
      setError('Fehler beim Laden der Mitarbeiter');
    } finally {
      setIsLoading(false);
    }
  };

  const copyShareLink = async () => {
    const shareUrl = `${window.location.origin}/document/${documentId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
      setError('Fehler beim Kopieren des Links');
    }
  };

  const handleUpdatePermission = async (userId: string, newLevel: 'owner' | 'editor' | 'viewer') => {
    try {
      await apiClient.put(`/docs/${documentId}/permissions/${userId}`, {
        permission_level: newLevel,
      });
      await fetchCollaborators();
    } catch (error) {
      console.error('Failed to update permission:', error);
      setError('Fehler beim Aktualisieren der Berechtigung');
    }
  };

  const handleRevokePermission = async (userId: string) => {
    if (!window.confirm('Berechtigung wirklich entziehen?')) {
      return;
    }

    try {
      await apiClient.delete(`/docs/${documentId}/permissions/${userId}`);
      await fetchCollaborators();
    } catch (error) {
      console.error('Failed to revoke permission:', error);
      setError('Fehler beim Entziehen der Berechtigung');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  };

  const getPermissionLabel = (level: string) => {
    switch (level) {
      case 'owner':
        return 'Eigentümer';
      case 'editor':
        return 'Bearbeiter';
      case 'viewer':
        return 'Betrachter';
      default:
        return level;
    }
  };

  return (
    <div className="share-modal-overlay" onClick={onClose}>
      <div className="share-modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="share-modal-header">
          <h2>Dokument teilen</h2>
          <button onClick={onClose} className="close-button">
            ×
          </button>
        </div>

        {error && (
          <div className="share-error">
            {error}
          </div>
        )}

        <div className="share-link-section">
          <h3>Link teilen</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--font-color-secondary)', marginBottom: '0.75rem' }}>
            Jeder mit diesem Link kann das Dokument öffnen
          </p>
          <div className="link-container">
            <input
              type="text"
              value={`${window.location.origin}/document/${documentId}`}
              readOnly
              className="link-input"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button onClick={copyShareLink} className="copy-button">
              {copySuccess ? '✓ Kopiert' : 'Link kopieren'}
            </button>
          </div>
        </div>

        <div className="collaborators-section">
          <h3>Personen mit Zugriff</h3>
          {isLoading ? (
            <div className="loading">Lädt...</div>
          ) : collaborators.length === 0 ? (
            <div className="no-collaborators">Noch keine Mitarbeiter</div>
          ) : (
            <div className="collaborators-list">
              {collaborators.map((collaborator) => (
                <div key={collaborator.user_id} className="collaborator-item">
                  <div className="collaborator-info">
                    {collaborator.avatar_url && (
                      <img
                        src={collaborator.avatar_url}
                        alt={collaborator.display_name}
                        className="user-avatar"
                      />
                    )}
                    <div>
                      <div className="user-name">{collaborator.display_name}</div>
                      <div className="user-email">{collaborator.email}</div>
                      <div className="permission-meta">
                        Hinzugefügt am {formatDate(collaborator.granted_at)}
                      </div>
                    </div>
                  </div>
                  <div className="collaborator-actions">
                    {collaborator.permission_level === 'owner' ? (
                      <span className="permission-badge owner-badge">
                        {getPermissionLabel(collaborator.permission_level)}
                      </span>
                    ) : (
                      <>
                        <select
                          value={collaborator.permission_level}
                          onChange={(e) =>
                            handleUpdatePermission(
                              collaborator.user_id,
                              e.target.value as 'owner' | 'editor' | 'viewer'
                            )
                          }
                          className="permission-select"
                        >
                          <option value="editor">Bearbeiter</option>
                          <option value="viewer">Betrachter</option>
                        </select>
                        <button
                          onClick={() => handleRevokePermission(collaborator.user_id)}
                          className="revoke-button"
                        >
                          Entfernen
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
