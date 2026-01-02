import React, { useState, useRef } from 'react';
import { HiX, HiShare, HiUserGroup, HiCheck } from 'react-icons/hi';
import { useGroups, useGroupSharing } from '../../features/groups/hooks/useGroups';
import Spinner from './Spinner';

/**
 * ShareToGroupModal component - allows sharing content to user's groups
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {Function} props.onClose - Close modal callback
 * @param {string} props.contentType - Type of content (documents, custom_generators, notebook_collections, user_documents)
 * @param {string} props.contentId - ID of content to share
 * @param {string} props.contentTitle - Display title of content
 * @param {Function} props.onSuccess - Success callback
 * @param {Function} props.onError - Error callback
 * @returns {JSX.Element|null} Share modal or null if not open
 */
const ShareToGroupModal = ({
  isOpen,
  onClose,
  contentType,
  contentId,
  contentTitle,
  onSuccess,
  onError
}) => {
  const modalRef = useRef(null);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [permissions, setPermissions] = useState({
    read: true,
    write: false,
    collaborative: false
  });

  // Get user's groups - isActive: true since modal is open
  const { userGroups, isLoadingGroups, isErrorGroups } = useGroups({ isActive: true });

  // Get sharing functionality for the selected group
  const { shareContent, isSharing } = useGroupSharing(selectedGroupId, { isActive: true });

  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleShare = async () => {
    if (!selectedGroupId || !contentType || !contentId) {
      onError?.('Bitte wähle eine Gruppe aus.');
      return;
    }

    try {
      await shareContent(contentType, contentId, {
        permissions,
        targetGroupId: selectedGroupId,
        onSuccess: (result) => {
          onSuccess?.(`"${contentTitle}" wurde erfolgreich mit der Gruppe geteilt.`);
          onClose();
        },
        onError: (error) => {
          onError?.(error.message || 'Fehler beim Teilen des Inhalts.');
        }
      });
    } catch (error) {
      onError?.(error.message || 'Fehler beim Teilen des Inhalts.');
    }
  };

  const handlePermissionChange = (permissionType, value) => {
    setPermissions(prev => ({
      ...prev,
      [permissionType]: value
    }));
  };

  const getContentTypeLabel = (type) => {
    const labels = {
      'documents': 'Dokument',
      'custom_generators': 'Custom Generator',
      'notebook_collections': 'Notebook',
      'user_documents': 'Text',
      'database': 'Template'
    };
    return labels[type] || 'Inhalt';
  };

  return (
    <div className="citation-modal-overlay" onClick={handleOverlayClick}>
      <div className="citation-modal share-modal" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <div className="citation-modal-header">
          <div className="share-modal-title">
            <HiShare className="share-modal-icon" />
            <h4>Mit Gruppe teilen</h4>
          </div>
          <button
            className="citation-modal-close"
            onClick={onClose}
            aria-label="Schließen"
            disabled={isSharing}
          >
            <HiX />
          </button>
        </div>

        <div className="citation-modal-content share-modal-content">
          {/* Content Info */}
          <div className="share-content-info">
            <div className="share-content-label">
              {getContentTypeLabel(contentType)}:
            </div>
            <div className="share-content-title">
              "{contentTitle}"
            </div>
          </div>

          {/* Group Selection */}
          <div className="share-form-section">
            <label className="share-form-label">
              <HiUserGroup className="share-form-icon" />
              Gruppe auswählen:
            </label>

            {isLoadingGroups ? (
              <div className="share-loading">
                <Spinner size="small" />
                <span>Gruppen werden geladen...</span>
              </div>
            ) : isErrorGroups ? (
              <div className="share-error">
                Fehler beim Laden der Gruppen.
              </div>
            ) : userGroups && userGroups.length > 0 ? (
              <select
                className="share-group-select"
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                disabled={isSharing}
              >
                <option value="">-- Gruppe auswählen --</option>
                {userGroups.map(group => (
                  <option key={group.id} value={group.id}>
                    {group.name} {group.isAdmin ? '(Admin)' : '(Mitglied)'}
                  </option>
                ))}
              </select>
            ) : (
              <div className="share-no-groups">
                Du bist noch nicht Mitglied einer Gruppe.
                <br />
                Erstelle oder tritt einer Gruppe bei, um Inhalte zu teilen.
              </div>
            )}
          </div>

          {/* Permissions */}
          {selectedGroupId && (
            <div className="share-form-section">
              <label className="share-form-label">
                Berechtigungen:
              </label>

              <div className="share-permissions">
                <div className="share-permission-item">
                  <label className="share-permission-label">
                    <input
                      type="checkbox"
                      checked={permissions.read}
                      onChange={(e) => handlePermissionChange('read', e.target.checked)}
                      disabled={isSharing}
                    />
                    <span className="share-permission-text">
                      <strong>Lesen:</strong> Gruppenmitglieder können den Inhalt einsehen und verwenden
                    </span>
                  </label>
                </div>

                <div className="share-permission-item">
                  <label className="share-permission-label">
                    <input
                      type="checkbox"
                      checked={permissions.write}
                      onChange={(e) => handlePermissionChange('write', e.target.checked)}
                      disabled={isSharing}
                    />
                    <span className="share-permission-text">
                      <strong>Bearbeiten:</strong> Gruppenmitglieder können den Inhalt modifizieren
                    </span>
                  </label>
                </div>

                <div className="share-permission-item">
                  <label className="share-permission-label">
                    <input
                      type="checkbox"
                      checked={permissions.collaborative}
                      onChange={(e) => handlePermissionChange('collaborative', e.target.checked)}
                      disabled={isSharing}
                    />
                    <span className="share-permission-text">
                      <strong>Kollaborativ:</strong> Echtzeit-Zusammenarbeit aktivieren
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="share-modal-actions">
            <button
              className="share-cancel-button"
              onClick={onClose}
              disabled={isSharing}
            >
              Abbrechen
            </button>
            <button
              className="share-submit-button"
              onClick={handleShare}
              disabled={!selectedGroupId || isSharing || !permissions.read}
            >
              {isSharing ? (
                <>
                  <Spinner size="small" />
                  Wird geteilt...
                </>
              ) : (
                <>
                  <HiCheck />
                  Teilen
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShareToGroupModal;
