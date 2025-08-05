import React from 'react';
import PropTypes from 'prop-types';
import { IoAccessibility } from 'react-icons/io5';
import DownloadButton from '../../features/sharepic/core/components/DownloadButton';
import CopyButton from './CopyButton';
import HelpTooltip from './HelpTooltip';
import useAltTextGeneration from '../hooks/useAltTextGeneration';
import useSharepicStore from '../../stores/sharepicStore';

/**
 * Component for displaying generated sharepic with preview and download functionality
 * @param {Object} props - Component props
 * @param {Object} props.sharepicData - The sharepic data containing text and image
 * @param {string} props.sharepicData.text - The generated text/slogan
 * @param {string} props.sharepicData.image - Base64 encoded image data
 * @returns {JSX.Element} SharepicDisplay component
 */
const SharepicDisplay = ({ sharepicData }) => {
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

  const handleGenerateAltText = async () => {
    if (isAltTextLoading) return;

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
      console.error('[SharepicDisplay] Alt text generation failed:', error);
      setAltTextError(error.message || 'Fehler bei der Alt-Text-Generierung');
    } finally {
      setAltTextLoading(false);
    }
  };

  return (
    <div className="sharepic-display">
      <div className="sharepic-display__header">
        <h4 className="sharepic-display__title">Generiertes Sharepic</h4>
      </div>
      
      <div className="sharepic-display__content">
        <div className="sharepic-display__preview">
          <div className="sharepic-image-container">
            <img 
              src={sharepicData.image} 
              alt="Generiertes Sharepic" 
              className="sharepic-preview-image"
            />
            <button 
              className="sharepic-alt-button"
              onClick={handleGenerateAltText}
              disabled={isAltTextLoading}
              title="Alt-Text generieren"
            >
              <IoAccessibility />
              {isAltTextLoading ? 'Lädt...' : 'Alt-Text'}
            </button>
          </div>
        </div>
        
        <div className="sharepic-display__actions">
          <DownloadButton imageUrl={sharepicData.image} />
        </div>
      </div>

      {/* Alt text display section */}
      {showAltText && (
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
  );
};

SharepicDisplay.propTypes = {
  sharepicData: PropTypes.shape({
    text: PropTypes.string,
    image: PropTypes.string.isRequired,
    slogans: PropTypes.array
  }).isRequired,
  componentName: PropTypes.string
};

export default SharepicDisplay;