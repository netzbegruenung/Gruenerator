import React from 'react';
import PropTypes from 'prop-types';
import DownloadButton from '../../features/sharepic/core/components/DownloadButton';

/**
 * Component for displaying generated sharepic with preview and download functionality
 * @param {Object} props - Component props
 * @param {Object} props.sharepicData - The sharepic data containing text and image
 * @param {string} props.sharepicData.text - The generated text/slogan
 * @param {string} props.sharepicData.image - Base64 encoded image data
 * @returns {JSX.Element} SharepicDisplay component
 */
const SharepicDisplay = ({ sharepicData }) => {
  if (!sharepicData?.image) {
    return null;
  }

  return (
    <div className="sharepic-display">
      <div className="sharepic-display__header">
        <h4 className="sharepic-display__title">Generiertes Sharepic</h4>
      </div>
      
      <div className="sharepic-display__content">
        <div className="sharepic-display__preview">
          <img 
            src={sharepicData.image} 
            alt="Generiertes Sharepic" 
            className="sharepic-preview-image"
          />
        </div>
        
        <div className="sharepic-display__actions">
          <DownloadButton imageUrl={sharepicData.image} />
        </div>
      </div>
    </div>
  );
};

SharepicDisplay.propTypes = {
  sharepicData: PropTypes.shape({
    text: PropTypes.string,
    image: PropTypes.string.isRequired,
    slogans: PropTypes.array
  }).isRequired
};

export default SharepicDisplay;