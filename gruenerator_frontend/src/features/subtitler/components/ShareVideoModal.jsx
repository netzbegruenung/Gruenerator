import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useSubtitlerShareStore, getShareUrl } from '../../../stores/subtitlerShareStore';
import EnhancedSelect from '../../../components/common/EnhancedSelect/EnhancedSelect';
import '../styles/ShareVideoModal.css';

const expirationOptions = [
  { value: 1, label: '1 Tag' },
  { value: 7, label: '7 Tage' },
  { value: 14, label: '14 Tage' },
  { value: 30, label: '30 Tage' },
];

const ShareVideoModal = ({ projectId, title, onClose }) => {
  const [shareTitle, setShareTitle] = useState(title || 'Untertiteltes Video');
  const [expiresInDays, setExpiresInDays] = useState(expirationOptions[1]);
  const [copied, setCopied] = useState(false);

  const { createShareFromProject, currentShare, isCreatingShare, error, errorCode, clearError, clearCurrentShare } = useSubtitlerShareStore();

  useEffect(() => {
    clearCurrentShare();
    clearError();
  }, [clearCurrentShare, clearError]);

  const handleCreateShare = async () => {
    if (!projectId) return;
    try {
      clearError();
      await createShareFromProject(projectId, shareTitle, expiresInDays.value);
    } catch (err) {
      console.error('Failed to create share:', err);
    }
  };

  const handleCopyLink = () => {
    if (currentShare?.shareToken) {
      const url = getShareUrl(currentShare.shareToken);
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatExpiration = (expiresAt) => {
    if (!expiresAt) return '';
    const date = new Date(expiresAt);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="share-modal-overlay" onClick={onClose}>
      <div className="share-modal" onClick={(e) => e.stopPropagation()}>
        <button className="share-modal-close" onClick={onClose}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <h2>Video teilen</h2>

        {!currentShare ? (
          <>
            <p className="share-modal-description">
              Erstelle einen Link, den du mit anderen teilen kannst.
            </p>

            <div className="share-modal-form">
              <div className="form-group">
                <label htmlFor="shareTitle">Titel</label>
                <input
                  id="shareTitle"
                  type="text"
                  value={shareTitle}
                  onChange={(e) => setShareTitle(e.target.value)}
                  placeholder="Titel für das geteilte Video"
                />
              </div>

              <EnhancedSelect
                label="Link gültig für"
                options={expirationOptions}
                value={expiresInDays}
                onChange={setExpiresInDays}
                isSearchable={false}
                menuPlacement="auto"
              />
            </div>

            {error && (
              <div className={`share-modal-error ${errorCode === 'EXPORT_REQUIRED' ? 'export-required' : ''}`}>
                {errorCode === 'EXPORT_REQUIRED' ? (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{error}</span>
                  </>
                ) : error}
              </div>
            )}

            <div className="share-modal-actions">
              <button
                className="btn-secondary"
                onClick={onClose}
                disabled={isCreatingShare}
              >
                Abbrechen
              </button>
              <button
                className="btn-primary"
                onClick={handleCreateShare}
                disabled={isCreatingShare || !shareTitle.trim()}
              >
                {isCreatingShare ? 'Wird erstellt...' : 'Link erstellen'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="share-modal-success">
              <div className="share-success-icon">
                <svg className="share-success-svg" width="48" height="48" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22,4 12,14.01 9,11.01" />
                </svg>
              </div>
              <h3>Link erstellt</h3>
              <p>Der Link ist gültig bis {formatExpiration(currentShare.expiresAt)}</p>
            </div>

            <div className="share-link-container">
              <input
                type="text"
                readOnly
                value={getShareUrl(currentShare.shareToken)}
                className="share-link-input"
              />
              <button
                className="share-copy-button"
                onClick={handleCopyLink}
              >
                {copied ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20,6 9,17 4,12" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            </div>

            {currentShare.status === 'rendering' && (
              <p className="share-modal-info share-modal-rendering-info">
                Das Video wird im Hintergrund gerendert. Der Empfänger kann es herunterladen, sobald es fertig ist.
              </p>
            )}

            <div className="share-modal-actions">
              <button
                className="btn-primary"
                onClick={onClose}
              >
                Fertig
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

ShareVideoModal.propTypes = {
  projectId: PropTypes.string.isRequired,
  title: PropTypes.string,
  onClose: PropTypes.func.isRequired,
};

export default ShareVideoModal;
