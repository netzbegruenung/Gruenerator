import { useState, useEffect } from 'react';
import { apiClient } from '../../lib/apiClient';
import './VersionHistory.css';

interface Version {
  id: string;
  version: number;
  label: string | null;
  is_auto_save: boolean;
  created_at: string;
  created_by: string;
  created_by_name: string;
}

interface VersionHistoryProps {
  documentId: string;
  onClose: () => void;
  onRestore: () => void;
}

export const VersionHistory = ({ documentId, onClose, onRestore }: VersionHistoryProps) => {
  const [versions, setVersions] = useState<Version[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newVersionLabel, setNewVersionLabel] = useState('');

  useEffect(() => {
    fetchVersions();
  }, [documentId]);

  const fetchVersions = async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.get(`/docs/${documentId}/versions`);
      setVersions(response.data);
      setError(null);
    } catch (error) {
      console.error('Failed to fetch versions:', error);
      setError('Fehler beim Laden der Versionen');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateVersion = async () => {
    if (!newVersionLabel.trim()) return;

    try {
      setIsCreating(true);
      await apiClient.post(`/docs/${documentId}/versions`, {
        label: newVersionLabel,
      });
      setNewVersionLabel('');
      await fetchVersions();
    } catch (error) {
      console.error('Failed to create version:', error);
      setError('Fehler beim Erstellen der Version');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRestoreVersion = async (versionNumber: number) => {
    if (!window.confirm('Dokument zu dieser Version wiederherstellen?')) {
      return;
    }

    try {
      await apiClient.post(`/docs/${documentId}/versions/${versionNumber}/restore`);
      await fetchVersions();
      onRestore();
    } catch (error) {
      console.error('Failed to restore version:', error);
      setError('Fehler beim Wiederherstellen der Version');
    }
  };

  const handleDeleteVersion = async (versionNumber: number) => {
    if (!window.confirm('Diese Version wirklich löschen?')) {
      return;
    }

    try {
      await apiClient.delete(`/docs/${documentId}/versions/${versionNumber}`);
      await fetchVersions();
    } catch (error) {
      console.error('Failed to delete version:', error);
      setError('Fehler beim Löschen der Version');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <div className="version-history-overlay" onClick={onClose}>
      <div className="version-history-panel" onClick={(e) => e.stopPropagation()}>
        <div className="version-history-header">
          <h2>Versionsverlauf</h2>
          <button onClick={onClose} className="close-button">
            ×
          </button>
        </div>

        <div className="create-version-section">
          <input
            type="text"
            value={newVersionLabel}
            onChange={(e) => setNewVersionLabel(e.target.value)}
            placeholder="Version benennen..."
            className="version-label-input"
          />
          <button
            onClick={handleCreateVersion}
            disabled={!newVersionLabel.trim() || isCreating}
            className="create-version-button"
          >
            {isCreating ? 'Erstellt...' : 'Version erstellen'}
          </button>
        </div>

        {error && (
          <div className="version-error">
            {error}
          </div>
        )}

        <div className="versions-list">
          {isLoading ? (
            <div className="loading">Lädt...</div>
          ) : versions.length === 0 ? (
            <div className="no-versions">Noch keine Versionen vorhanden</div>
          ) : (
            versions.map((version) => (
              <div key={version.id} className="version-item">
                <div className="version-info">
                  <div className="version-header">
                    <span className="version-number">Version {version.version}</span>
                    {!version.is_auto_save && (
                      <span className="version-badge">Manuell</span>
                    )}
                  </div>
                  {version.label && (
                    <div className="version-label">{version.label}</div>
                  )}
                  <div className="version-meta">
                    {formatDate(version.created_at)}
                    {version.created_by_name && ` • ${version.created_by_name}`}
                  </div>
                </div>
                <div className="version-actions">
                  <button
                    onClick={() => handleRestoreVersion(version.version)}
                    className="restore-button"
                  >
                    Wiederherstellen
                  </button>
                  {!version.is_auto_save && (
                    <button
                      onClick={() => handleDeleteVersion(version.version)}
                      className="delete-button"
                    >
                      Löschen
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
