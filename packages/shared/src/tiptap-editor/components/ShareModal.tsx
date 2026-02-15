import { useState, useEffect, useCallback } from 'react';
import './ShareModal.css';

interface Collaborator {
  user_id: string;
  display_name: string;
  email: string;
  avatar_url?: string;
  permission_level: 'owner' | 'editor' | 'viewer';
  granted_at: string;
  granted_by?: string;
}

interface ShareSettings {
  is_public: boolean;
  share_permission: 'viewer' | 'editor';
}

interface ShareModalProps {
  documentId: string;
  onClose: () => void;
  apiClient?: {
    get: (url: string) => Promise<{ data: any }>;
    post: (url: string, data?: any) => Promise<{ data: any }>;
    put: (url: string, data: any) => Promise<{ data: any }>;
    delete: (url: string) => Promise<{ data: any }>;
  };
  baseUrl?: string;
}

export const ShareModal = ({ documentId, onClose, apiClient, baseUrl }: ShareModalProps) => {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [shareSettings, setShareSettings] = useState<ShareSettings>({ is_public: false, share_permission: 'editor' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isTogglingPublic, setIsTogglingPublic] = useState(false);

  const fetchCollaborators = useCallback(async () => {
    if (!apiClient) return;

    try {
      setIsLoading(true);
      const response = await apiClient.get(`/docs/${documentId}/permissions`);
      setCollaborators(response.data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch collaborators:', err);
      setError('Fehler beim Laden der Mitarbeiter');
    } finally {
      setIsLoading(false);
    }
  }, [documentId, apiClient]);

  const fetchShareSettings = useCallback(async () => {
    if (!apiClient) return;

    try {
      const response = await apiClient.get(`/docs/${documentId}/share`);
      setShareSettings(response.data);
    } catch (err) {
      console.error('Failed to fetch share settings:', err);
    }
  }, [documentId, apiClient]);

  useEffect(() => {
    fetchCollaborators();
    fetchShareSettings();
  }, [fetchCollaborators, fetchShareSettings]);

  const getShareUrl = () => {
    const base = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
    return `${base}/document/${documentId}`;
  };

  const copyShareLink = async () => {
    const shareUrl = getShareUrl();
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
      setError('Fehler beim Kopieren des Links');
    }
  };

  const togglePublicSharing = async () => {
    if (!apiClient) return;

    try {
      setIsTogglingPublic(true);
      const endpoint = shareSettings.is_public
        ? `/docs/${documentId}/share/disable`
        : `/docs/${documentId}/share/enable`;
      const response = await apiClient.post(endpoint);
      setShareSettings(response.data);
    } catch (err) {
      console.error('Failed to toggle public sharing:', err);
      setError('Fehler beim Ändern der Freigabe');
    } finally {
      setIsTogglingPublic(false);
    }
  };

  const updateSharePermission = async (permission: 'viewer' | 'editor') => {
    if (!apiClient) return;

    try {
      const response = await apiClient.put(`/docs/${documentId}/share/permission`, { permission });
      setShareSettings(response.data);
    } catch (err) {
      console.error('Failed to update share permission:', err);
      setError('Fehler beim Ändern der Berechtigung');
    }
  };

  const handleUpdatePermission = async (
    userId: string,
    newLevel: 'owner' | 'editor' | 'viewer'
  ) => {
    if (!apiClient) return;

    try {
      await apiClient.put(`/docs/${documentId}/permissions/${userId}`, {
        permission_level: newLevel,
      });
      await fetchCollaborators();
    } catch (err) {
      console.error('Failed to update permission:', err);
      setError('Fehler beim Aktualisieren der Berechtigung');
    }
  };

  const handleRevokePermission = async (userId: string) => {
    if (!apiClient) return;
    if (!window.confirm('Berechtigung wirklich entziehen?')) {
      return;
    }

    try {
      await apiClient.delete(`/docs/${documentId}/permissions/${userId}`);
      await fetchCollaborators();
    } catch (err) {
      console.error('Failed to revoke permission:', err);
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

        {error && <div className="share-error">{error}</div>}

        <div className="share-link-section">
          <div className="public-sharing-toggle">
            <div className="public-sharing-info">
              <h3>Jeder mit dem Link</h3>
              <p className="public-sharing-description">
                {shareSettings.is_public
                  ? 'Jeder mit dem Link kann dieses Dokument öffnen'
                  : 'Nur eingeladene Personen haben Zugriff'}
              </p>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={shareSettings.is_public}
                onChange={togglePublicSharing}
                disabled={isTogglingPublic}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          {shareSettings.is_public && (
            <>
              <div className="public-permission-row">
                <select
                  value={shareSettings.share_permission}
                  onChange={(e) => updateSharePermission(e.target.value as 'viewer' | 'editor')}
                  className="permission-select"
                >
                  <option value="editor">Kann bearbeiten</option>
                  <option value="viewer">Kann ansehen</option>
                </select>
              </div>
              <div className="link-container">
                <input
                  type="text"
                  value={getShareUrl()}
                  readOnly
                  className="link-input"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button onClick={copyShareLink} className="copy-button">
                  {copySuccess ? '✓ Kopiert' : 'Link kopieren'}
                </button>
              </div>
            </>
          )}
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
