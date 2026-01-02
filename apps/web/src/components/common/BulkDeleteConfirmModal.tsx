import React, { useState, useRef, useEffect } from 'react';
import { HiX, HiExclamationCircle, HiTrash } from 'react-icons/hi';
import Spinner from './Spinner';

/**
 * BulkDeleteConfirmModal component - provides safe confirmation for bulk delete operations
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {Function} props.onClose - Close modal callback
 * @param {Function} props.onConfirm - Confirm deletion callback
 * @param {number} props.itemCount - Number of items to be deleted
 * @param {string} props.itemType - Type of items being deleted (for display)
 * @param {boolean} props.isDeleting - Whether deletion is in progress
 * @returns {JSX.Element|null} Confirmation modal or null if not open
 */
const BulkDeleteConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  itemCount,
  itemType = 'Elemente',
  isDeleting = false
}) => {
  const modalRef = useRef(null);
  const [confirmText, setConfirmText] = useState('');
  const [isConfirmValid, setIsConfirmValid] = useState(false);
  const inputRef = useRef(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setConfirmText('');
      setIsConfirmValid(false);
      // Focus the input after a short delay to ensure modal is rendered
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Validate confirmation text
  useEffect(() => {
    setIsConfirmValid(confirmText.trim().toLowerCase() === 'löschen');
  }, [confirmText]);

  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget && !isDeleting) {
      onClose();
    }
  };

  const handleConfirm = () => {
    if (isConfirmValid && !isDeleting) {
      onConfirm();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && isConfirmValid && !isDeleting) {
      handleConfirm();
    } else if (e.key === 'Escape' && !isDeleting) {
      onClose();
    }
  };

  const getItemTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'document': 'Dokument',
      'documents': 'Dokumente',
      'text': 'Text',
      'texts': 'Texte',
      'notebook': 'Notebook',
      'qas': 'Notebooks',
      'template': 'Vorlage',
      'templates': 'Vorlagen'
    };
    return labels[type] || type;
  };

  const getSingularType = () => {
    const singular: Record<string, string> = {
      'documents': 'document',
      'texts': 'text',
      'qas': 'notebook',
      'templates': 'template'
    };
    return singular[itemType] || itemType;
  };

  const displayType = itemCount === 1 ? getItemTypeLabel(getSingularType()) : getItemTypeLabel(itemType);

  return (
    <div className="citation-modal-overlay" onClick={handleOverlayClick}>
      <div className="citation-modal bulk-delete-modal" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <div className="citation-modal-header">
          <div className="bulk-delete-modal-title">
            <HiExclamationCircle className="bulk-delete-warning-icon" />
            <h4>Bulk-Löschen bestätigen</h4>
          </div>
          <button
            className="citation-modal-close"
            onClick={onClose}
            aria-label="Schließen"
            disabled={isDeleting}
          >
            <HiX />
          </button>
        </div>

        <div className="citation-modal-content bulk-delete-content">
          {/* Warning Section */}
          <div className="bulk-delete-warning">
            <div className="bulk-delete-warning-text">
              <p>
                <strong>Achtung:</strong> Du bist dabei, <strong>{itemCount} {displayType}</strong> zu löschen.
              </p>
              <p>
                Diese Aktion kann <strong>nicht rückgängig gemacht werden</strong> und alle Daten gehen dauerhaft verloren.
              </p>
            </div>
          </div>

          {/* Confirmation Input Section */}
          <div className="bulk-delete-confirmation">
            <label className="bulk-delete-confirmation-label">
              Um fortzufahren, gib <strong>"löschen"</strong> ein:
            </label>
            <input
              ref={inputRef}
              type="text"
              className={`form-input bulk-delete-confirmation-input ${isConfirmValid ? 'valid' : ''}`}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="löschen"
              disabled={isDeleting}
              autoComplete="off"
            />
            {confirmText && !isConfirmValid && (
              <div className="bulk-delete-hint">
                Gib genau "löschen" ein (ohne Anführungszeichen)
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="bulk-delete-actions">
            <button
              className="bulk-delete-cancel-button"
              onClick={onClose}
              disabled={isDeleting}
            >
              Abbrechen
            </button>
            <button
              className={`bulk-delete-confirm-button ${isConfirmValid ? 'enabled' : 'disabled'}`}
              onClick={handleConfirm}
              disabled={!isConfirmValid || isDeleting}
            >
              {isDeleting ? (
                <>
                  <Spinner size="small" />
                  Lösche...
                </>
              ) : (
                <>
                  <HiTrash />
                  {itemCount} {displayType} löschen
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkDeleteConfirmModal;
