import { useRef } from 'react';
import { SiCanva } from 'react-icons/si';
import CopyButton from './CopyButton';
import '../../assets/styles/components/common/canva-template-modal.css';

/**
 * CanvaTemplateModal - Rich modal for opening Canva templates
 * Shows preview thumbnail, description, and opens template in new tab
 */
interface CanvaTemplateModalProps {
  url: string;
  previewImage?: string;
  title?: string;
  sharepicLines?: {
    line1?: string;
    line2?: string;
    line3?: string;
    line4?: string;
    line5?: string
  };
  onClose: () => void;
}

const CanvaTemplateModal = ({ url,
  previewImage,
  title = 'In Canva bearbeiten',
  sharepicLines,
  onClose }: CanvaTemplateModalProps): JSX.Element => {
  const modalRef = useRef(null);

  const formatLinesForCopy = (lines) => {
    if (!lines) return '';
    return [1, 2, 3, 4, 5]
      .map(n => lines[`line${n}`])
      .filter(Boolean)
      .join('\n');
  };

  const hasLines = sharepicLines && [1, 2, 3, 4, 5].some(n => sharepicLines[`line${n}`]);

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleOpenCanva = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="canva-template-modal-overlay" onClick={handleOverlayClick}>
      <div className="canva-template-modal" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <button
          className="canva-template-modal-close"
          onClick={onClose}
          aria-label="Schliessen"
        >
          &times;
        </button>

        <div className="canva-template-modal-content">
          {previewImage && (
            <div className="canva-template-preview">
              <img
                src={previewImage}
                alt="Vorlagenvorschau"
                className="canva-template-preview-image"
              />
            </div>
          )}

          <div className="canva-template-info">
            <div className="canva-template-modal-title">
              <SiCanva className="canva-template-modal-icon" />
              <h4>{title}</h4>
            </div>

            <div className="canva-template-description">
              <p>
                Bearbeite diese Vorlage direkt in Canva. Du kannst Texte, Farben und
                Elemente nach deinen Wünschen anpassen.
              </p>
            </div>

            <div className="canva-template-actions">
              <button
                className="canva-template-open-button"
                onClick={handleOpenCanva}
              >
                <SiCanva className="canva-template-button-icon" />
                In Canva öffnen
              </button>
            </div>

            {hasLines && (
              <div className="canva-template-text">
                <div className="canva-template-text-header">
                  <span>Gedicht-Text:</span>
                  <CopyButton
                    directContent={formatLinesForCopy(sharepicLines)}
                    variant="icon"
                    className="canva-template-copy-button"
                  />
                </div>
                <div className="canva-template-text-content">
                  {formatLinesForCopy(sharepicLines)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CanvaTemplateModal;
