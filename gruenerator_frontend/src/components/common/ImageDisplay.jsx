import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { IoAccessibility } from 'react-icons/io5';
import { HiPencil, HiDownload } from 'react-icons/hi';
import { FaMagic } from 'react-icons/fa';
import '../../assets/styles/components/common/image-display.css';
import DownloadButton from '../../features/sharepic/core/components/DownloadButton';
import CopyButton from './CopyButton';
import HelpTooltip from './HelpTooltip';
import useAltTextGeneration from '../hooks/useAltTextGeneration';
import useSharepicStore from '../../stores/sharepicStore';
import apiClient from '../utils/apiClient';

/**
 * Component for displaying generated images with preview, lightbox, and download functionality
 * @param {Object} props - Component props
 * @param {Object} props.sharepicData - The image data containing text and image
 * @param {string} props.sharepicData.text - The generated text/description
 * @param {string} props.sharepicData.image - Base64 encoded image data
 * @param {string} props.sharepicData.type - The type of image (info, quote, etc.)
 * @param {Function} props.onEdit - Callback function when edit button is clicked (optional)
 * @returns {JSX.Element} ImageDisplay component
 */
const ImageDisplay = ({
  sharepicData,
  onEdit,
  showEditButton = true,
  title = "Generiertes Bild",
  downloadButtonText = "Bild herunterladen",
  downloadFilename,
  enableKiLabel = false,
  onSharepicUpdate,
  minimal = false
}) => {
  // Lightbox state
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isKiLabelLoading, setIsKiLabelLoading] = useState(false);
  const [kiLabelError, setKiLabelError] = useState(null);
  
  // Alt text functionality
  const { generateAltTextForImage } = useAltTextGeneration();
  const {
    altText,
    isAltTextLoading,
    altTextError,
    showAltText,
    setAltText,
    setAltTextLoading,
    setAltTextError,
    setShowAltText
  } = useSharepicStore();

  if (!sharepicData?.image) {
    return null;
  }

  // Lightbox handlers
  const openLightbox = () => setIsLightboxOpen(true);
  const closeLightbox = () => setIsLightboxOpen(false);
  
  const handleLightboxOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      closeLightbox();
    }
  };
  
  // Keyboard event listener for lightbox
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isLightboxOpen) {
        closeLightbox();
      }
    };

    if (isLightboxOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden'; // Prevent background scroll
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isLightboxOpen]);

  // Debug logging
  console.log('[ImageDisplay] Component rendered:', {
    imageType: sharepicData?.type,
    hasOnEdit: !!onEdit,
    editButtonAlwaysVisible: true
  });

  const handleGenerateAltText = async () => {
    if (isAltTextLoading || isKiLabelLoading) return;

    setAltTextLoading(true);
    setAltTextError(null);

    try {
      // Extract base64 data from image
      const imageBase64 = sharepicData.image.replace(/^data:image\/[^;]+;base64,/, '');
      
      // Generate alt text using the existing hook
      const response = await generateAltTextForImage(imageBase64, sharepicData.text);
      
      if (response?.altText) {
        setAltText(response.altText);
        setShowAltText(true);
      } else {
        throw new Error('Keine Alt-Text-Antwort erhalten');
      }
    } catch (error) {
      console.error('[ImageDisplay] Alt text generation failed:', error);
      setAltTextError(error.message || 'Fehler bei der Alt-Text-Generierung');
    } finally {
      setAltTextLoading(false);
    }
  };

  const handleEditSharepic = async () => {
    // If onEdit prop is provided, use that instead (for social media generator)
    if (onEdit && typeof onEdit === 'function') {
      onEdit(sharepicData);
      return;
    }
    
    // Default behavior for direct sharepic display
    // Create unique editing session ID
    const editingSessionId = `sharepic-edit-${Date.now()}`;
    
    try {
      let imageSessionId = null;
      
      // Upload image to backend Redis storage if available
      if (sharepicData.image) {
        try {
          const imageResponse = await apiClient.post('/sharepic/edit-session', {
            imageData: sharepicData.image,
            metadata: {
              type: sharepicData.type,
              timestamp: Date.now()
            }
          });
          
          // Handle Axios response wrapper - extract data
          const result = imageResponse.data || imageResponse;
          imageSessionId = result.sessionId;
          console.log('[ImageDisplay] Image stored in backend:', imageSessionId);
        } catch (imageUploadError) {
          console.warn('[ImageDisplay] Failed to store image in backend:', imageUploadError);
        }
      }
      
      // Store minimal data in sessionStorage
      const sessionData = {
        text: sharepicData.text,
        type: sharepicData.type,
        slogans: sharepicData.slogans,
        hasImage: !!sharepicData.image,
        imageSessionId: imageSessionId // Store session ID instead of image
      };
      
      sessionStorage.setItem(editingSessionId, JSON.stringify({
        source: 'presseSocial',
        data: sessionData,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error('[ImageDisplay] Error preparing edit session:', error);
      // Fallback: store without image
      sessionStorage.setItem(editingSessionId, JSON.stringify({
        source: 'presseSocial',
        data: {
          text: sharepicData.text,
          type: sharepicData.type,
          slogans: sharepicData.slogans,
          hasImage: false
        },
        timestamp: Date.now()
      }));
    }
    
    // Open Sharepicgenerator in new tab with editing session
    const url = new URL(window.location.origin + '/sharepic');
    url.searchParams.append('editSession', editingSessionId);
    window.open(url.toString(), '_blank');
  };

  const resetAltTextState = () => {
    setAltText('');
    setAltTextError(null);
    setShowAltText(false);
  };

  const handleAddKiLabel = async () => {
    if (!enableKiLabel || isKiLabelLoading || !sharepicData?.image) {
      return;
    }

    setKiLabelError(null);
    setIsKiLabelLoading(true);

    try {
      const response = await fetch(sharepicData.image);
      if (!response.ok) {
        throw new Error('Bild konnte nicht gelesen werden.');
      }

      const blob = await response.blob();
      const mimeType = blob.type || 'image/png';
      const extension = mimeType.split('/')[1] || 'png';

      const formData = new FormData();
      formData.append('image', blob, `imagine-sharepic.${extension}`);

      const labelResponse = await apiClient.post('/imagine_label_canvas', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const labeledImage = labelResponse?.data?.image;
      if (!labeledImage) {
        throw new Error('Keine Antwort vom KI-Label-Service erhalten.');
      }

      if (typeof onSharepicUpdate === 'function') {
        onSharepicUpdate({ ...sharepicData, image: labeledImage });
      }

      resetAltTextState();
    } catch (error) {
      console.error('[ImageDisplay] KI label generation failed:', error);
      setKiLabelError(error.message || 'Fehler beim Hinzufügen des KI-Labels');
    } finally {
      setIsKiLabelLoading(false);
    }
  };

  const effectiveDownloadText = minimal ? 'Herunterladen' : downloadButtonText;
  const effectiveDownloadFilename = downloadFilename || 'sharepic.png';

  const handleDownload = React.useCallback(() => {
    try {
      const link = document.createElement('a');
      link.href = sharepicData.image;
      link.download = effectiveDownloadFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('[ImageDisplay] Download failed:', error);
    }
  }, [sharepicData.image, effectiveDownloadFilename]);

  return (
    <>
      <div className="image-display">
        {!minimal && (
          <div className="image-display__header">
            <h4 className="image-display__title">{title}</h4>
          </div>
        )}

        <div className="image-display__content">
          <div className="image-display__preview">
            <div className="image-container">
              <img 
                src={sharepicData.image} 
                alt="Generiertes Bild" 
                className="image-preview"
                onClick={openLightbox}
                style={{ cursor: 'pointer' }}
              />
              <div className="image-overlay-buttons">
                <button 
                  className={minimal ? 'image-button image-edit-button' : 'image-button image-alt-button'}
                  onClick={handleGenerateAltText}
                  disabled={isAltTextLoading || isKiLabelLoading}
                  title="Alt-Text generieren"
                >
                  <IoAccessibility />
                  {!minimal && (isAltTextLoading ? 'Lädt...' : 'Alt-Text')}
                </button>
                {enableKiLabel && (
                  <button
                    className="image-button image-label-button"
                    onClick={handleAddKiLabel}
                    disabled={isKiLabelLoading || isAltTextLoading}
                    title="KI-Label hinzufügen"
                  >
                    <FaMagic />
                    {isKiLabelLoading ? 'Beschriftet…' : 'KI-Label'}
                  </button>
                )}
                {showEditButton && (
                  <button 
                    className="image-button image-edit-button"
                    onClick={handleEditSharepic}
                    title="Bild bearbeiten"
                  >
                    <HiPencil />
                  </button>
                )}
                {minimal && (
                  <button
                    className="image-button image-edit-button"
                    onClick={handleDownload}
                    title="Bild herunterladen"
                  >
                    <HiDownload />
                  </button>
                )}
              </div>
            </div>
          </div>
          
          {!minimal && (
            <div className="image-display__actions">
              <DownloadButton 
                imageUrl={sharepicData.image} 
                buttonText={effectiveDownloadText}
                downloadFilename={downloadFilename}
              />
            </div>
          )}

          {!minimal && kiLabelError && (
            <div className="image-label-error">
              <span>⚠️ {kiLabelError}</span>
            </div>
          )}
        </div>

      {/* Alt text display section */}
      {!minimal && showAltText && (
        <div className="alt-text-inline-section">
          <div className="alt-text-header">
            <h3>Alt-Text für Barrierefreiheit</h3>
            <HelpTooltip>
              <p>
                Alt-Text beschreibt Bilder für Menschen mit Sehbehinderung. 
                Er wird von Screenreadern vorgelesen und macht Inhalte barrierefrei.
              </p>
              <p>
                <a href="https://www.dbsv.org/bildbeschreibung-4-regeln.html" 
                   target="_blank" 
                   rel="noopener noreferrer">
                  DBSV-Richtlinien für Bildbeschreibungen →
                </a>
              </p>
            </HelpTooltip>
            {altText && !isAltTextLoading && (
              <CopyButton 
                directContent={altText}
                variant="icon"
                className="alt-text-copy-button"
              />
            )}
          </div>
          
          {isAltTextLoading && (
            <div className="alt-text-loading">
              <span className="loading-spinner">⏳</span>
              <span>Alt-Text wird generiert...</span>
            </div>
          )}
          
          {altTextError && (
            <div className="alt-text-error">
              <span>⚠️</span>
              <span>Fehler bei der Alt-Text-Generierung: {altTextError}</span>
            </div>
          )}
          
          {altText && !isAltTextLoading && (
            <div className="alt-text-content">
              {altText}
            </div>
          )}
        </div>
      )}
      </div>

      {/* Lightbox */}
      {isLightboxOpen && (
        <div className="image-lightbox-overlay" onClick={handleLightboxOverlayClick}>
          <div className="image-lightbox-content">
            <button 
              className="image-lightbox-close"
              onClick={closeLightbox}
              aria-label="Lightbox schließen"
            >
              ×
            </button>
            <img 
              src={sharepicData.image} 
              alt="Vergrößertes Bild" 
              className="image-lightbox-image"
            />
          </div>
        </div>
      )}
    </>
  );
};

ImageDisplay.propTypes = {
  sharepicData: PropTypes.shape({
    text: PropTypes.string,
    image: PropTypes.string.isRequired,
    type: PropTypes.string,
    slogans: PropTypes.array
  }).isRequired,
  onEdit: PropTypes.func, // Optional - for backward compatibility, but not used anymore
  showEditButton: PropTypes.bool,
  title: PropTypes.string,
  downloadButtonText: PropTypes.string,
  downloadFilename: PropTypes.string,
  enableKiLabel: PropTypes.bool,
  onSharepicUpdate: PropTypes.func,
  minimal: PropTypes.bool
};

ImageDisplay.defaultProps = {
  minimal: false
};

export default ImageDisplay;
