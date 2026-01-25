import React from 'react';

export interface LoadTextConfirmModalProps {
  isOpen: boolean;
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation modal for loading saved text
 * Warns user about losing unsaved changes
 */
const LoadTextConfirmModal: React.FC<LoadTextConfirmModalProps> = ({
  isOpen,
  title,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) {
    return null;
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    } else if (e.key === 'Enter') {
      onConfirm();
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="load-text-modal-title"
      onKeyDown={handleKeyDown}
    >
      <div className="modal-content">
        <div className="modal-header">
          <h3 id="load-text-modal-title" className="modal-title">
            Text laden?
          </h3>
        </div>

        <div className="modal-body">
          <p className="modal-message">
            Möchten Sie <strong>"{title}"</strong> laden?
          </p>
          <p className="modal-warning">
            Ungespeicherte Änderungen im aktuellen Editor gehen verloren.
          </p>
        </div>

        <div className="modal-footer">
          <button type="button" className="button button--secondary" onClick={onCancel} autoFocus>
            Abbrechen
          </button>
          <button type="button" className="button button--primary" onClick={onConfirm}>
            Laden
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoadTextConfirmModal;
