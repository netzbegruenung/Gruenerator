import React, { useState } from 'react';
import PropTypes from 'prop-types';
import ImageSlider from '../../../../common/ImageSlider';

const TemplateCard = ({ template }) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  const handleImageLoad = () => {
    console.log('Image loaded');
    setImageLoading(false);
  };

  const handleImageError = () => {
    console.log('Image error');
    setImageError(true);
    setImageLoading(false);
  };

  const handleImageClick = () => {
    console.log('Image clicked');
  };

  const sliderImages = template.images.map(image => ({
    url: image.url,
    alt: image.alt
  }));

  return (
    <div className="template-card">
      <div className={`template-card-image ${imageLoading ? 'loading' : ''} ${imageError ? 'error' : ''}`}>
        {!imageError ? (
          <ImageSlider
            images={sliderImages}
            onLoad={handleImageLoad}
            onError={handleImageError}
            onImageClick={handleImageClick}
            className="template-slider"
          />
        ) : (
          <div className="placeholder-image">
            <img 
              src="/assets/images/placeholder-image.svg"
              alt="Vorschau nicht verfügbar"
              className="error-image"
            />
          </div>
        )}
        {imageLoading && (
          <div className="image-loading">
            <div className="loading-spinner"></div>
          </div>
        )}
      </div>
      <div className="template-card-content">
        <h3>{template.title}</h3>
        <p>{template.description}</p>
        <p className="template-credit">Von: {template.credit}</p>
        <div className="template-actions">
          <a 
            href={template.canvaUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="canva-button"
            aria-label={`${template.title} in Canva öffnen`}
          >
            In Canva öffnen
          </a>
        </div>
      </div>
    </div>
  );
};

TemplateCard.propTypes = {
  template: PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired,
    category: PropTypes.string.isRequired,
    images: PropTypes.arrayOf(PropTypes.shape({
      url: PropTypes.string.isRequired,
      alt: PropTypes.string.isRequired
    })).isRequired,
    canvaUrl: PropTypes.string.isRequired,
    tags: PropTypes.arrayOf(PropTypes.string).isRequired,
    credit: PropTypes.string.isRequired
  }).isRequired
};

export default TemplateCard; 