import React, { useState, useRef } from 'react';
import { HiX, HiPlus, HiExternalLink, HiCheck, HiExclamationCircle } from 'react-icons/hi';
import { templateService } from '../utils/templateService';
import { validateUrl, normalizeUrl } from '../../utils/urlValidation';
import Spinner from './Spinner';

/**
 * AddCanvaTemplateModal component - allows adding Canva templates via URL
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {Function} props.onClose - Close modal callback
 * @param {Function} props.onSuccess - Success callback with created template
 * @param {Function} props.onError - Error callback
 * @returns {JSX.Element|null} Add template modal or null if not open
 */
interface AddCanvaTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (data: any, message: string) => void;
  onError?: (message: string) => void;
}

const AddCanvaTemplateModal = ({
  isOpen,
  onClose,
  onSuccess,
  onError
}: AddCanvaTemplateModalProps) => {
  const modalRef = useRef(null);
  const [url, setUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [enhancedMetadata, setEnhancedMetadata] = useState(true); // Default to true for better UX

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const validateCanvaUrl = (inputUrl: string) => {
    // First validate basic URL format
    const basicValidation = validateUrl(inputUrl);
    if (!basicValidation.isValid) {
      return basicValidation;
    }

    try {
      const urlObj = new URL(inputUrl);

      // Check if it's a Canva domain
      if (!urlObj.hostname.includes('canva.com')) {
        return {
          isValid: false,
          error: 'URL muss von canva.com stammen.'
        };
      }

      // Check for design path
      if (!urlObj.pathname.includes('/design/')) {
        return {
          isValid: false,
          error: 'Bitte verwenden Sie eine gültige Canva Design-URL.'
        };
      }

      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: 'Ungültiges URL-Format.'
      };
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputUrl = e.target.value;
    setUrl(inputUrl);
    setValidationError('');
    setPreviewData(null);

    if (inputUrl.trim()) {
      const normalizedUrl = normalizeUrl(inputUrl);
      const validation = validateCanvaUrl(normalizedUrl);
      if (!validation.isValid) {
        setValidationError(validation.error || '');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!url.trim()) {
      setValidationError('Bitte geben Sie eine Canva URL ein.');
      return;
    }

    const normalizedUrl = normalizeUrl(url.trim());
    const validation = validateCanvaUrl(normalizedUrl);

    if (!validation.isValid) {
      setValidationError(validation.error || '');
      return;
    }

    setIsProcessing(true);
    setValidationError('');

    try {
      const result = await templateService.createUserTemplateFromUrl(normalizedUrl, enhancedMetadata);

      if (result.success) {
        onSuccess?.(result.data, result.message || 'Canva Vorlage wurde erfolgreich hinzugefügt.');
        handleClose();
      } else {
        setValidationError(result.message || 'Fehler beim Hinzufügen der Canva Vorlage.');
      }
    } catch (error: any) {
      console.error('[AddCanvaTemplateModal] Error creating template:', error);
      const errorMessage = error.message || 'Fehler beim Hinzufügen der Canva Vorlage.';
      setValidationError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setUrl('');
    setValidationError('');
    setPreviewData(null);
    setIsProcessing(false);
    setEnhancedMetadata(true); // Reset to default
    onClose();
  };

  const isValidUrl = url.trim() && !validationError;

  return (
    <div className="citation-modal-overlay" onClick={handleOverlayClick}>
      <div className="citation-modal add-template-modal" ref={modalRef} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div className="citation-modal-header">
          <div className="share-modal-title">
            <HiPlus className="share-modal-icon" />
            <h4>Canva Vorlage hinzufügen</h4>
          </div>
          <button
            className="citation-modal-close"
            onClick={handleClose}
            aria-label="Schließen"
            disabled={isProcessing}
          >
            <HiX />
          </button>
        </div>

        <div className="citation-modal-content add-template-modal-content">
          <form onSubmit={handleSubmit}>
            {/* URL Input */}
            <div className="add-template-form-section">
              <label className="add-template-form-label">
                <HiExternalLink className="add-template-form-icon" />
                Canva URL:
              </label>

              <div className="add-template-url-input-container">
                <input
                  type="url"
                  className={`add-template-url-input ${validationError ? 'error' : ''}`}
                  value={url}
                  onChange={handleUrlChange}
                  placeholder="https://www.canva.com/design/..."
                  disabled={isProcessing}
                  autoFocus
                />
                {isProcessing && (
                  <div className="add-template-input-spinner">
                    <Spinner size="small" />
                  </div>
                )}
              </div>

              {validationError && (
                <div className="add-template-error">
                  <HiExclamationCircle className="add-template-error-icon" />
                  {validationError}
                </div>
              )}
            </div>

            {/* Enhanced Metadata Option */}
            {isValidUrl && (
              <div className="add-template-form-section">
                <label className="add-template-checkbox-label">
                  <input
                    type="checkbox"
                    checked={enhancedMetadata}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnhancedMetadata(e.target.checked)}
                    disabled={isProcessing}
                    className="add-template-checkbox"
                  />
                  <span className="add-template-checkbox-text">
                    <strong>Vorschaubild und Metadaten extrahieren</strong>
                    <br />
                    <small>Lädt zusätzliche Informationen wie Vorschaubild, Abmessungen und Kategorien</small>
                  </span>
                </label>
              </div>
            )}

            {/* Help Text */}
            <div className="add-template-help">
              <p>
                Geben Sie die URL eines öffentlichen Canva Designs ein.
                Die Vorlage wird zu Ihrer persönlichen Sammlung hinzugefügt.
              </p>
              <p className="add-template-help-note">
                Beispiel: https://www.canva.com/design/DAGgS9o-sfY/view
              </p>
            </div>

            {/* Actions */}
            <div className="add-template-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={handleClose}
                disabled={isProcessing}
              >
                Abbrechen
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={!isValidUrl || isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Spinner size="small" />
                    Wird hinzugefügt...
                  </>
                ) : (
                  <>
                    <HiCheck className="icon" />
                    Vorlage hinzufügen
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AddCanvaTemplateModal;
