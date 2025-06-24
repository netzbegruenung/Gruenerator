import React, { useState } from 'react';
import PropTypes from 'prop-types';
import ImageSlider from '../../../../../components/common/ImageSlider';
import { useAuth } from '../../../../../hooks/useAuth';
import VerifyFeature from '../../../../../components/common/VerifyFeature';

const CanvaTemplateCard = ({ template }) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [showVerify, setShowVerify] = useState(false);
  const { isFeatureVerified } = useAuth();

  const handleImageLoad = () => {
    setImageLoading(false);
  };

  const handleImageError = () => {
    setImageError(true);
    setImageLoading(false);
  };

  const handleCanvaClick = (e) => {
    e.preventDefault();
    if (!isFeatureVerified('templates')) {
      setShowVerify(true);
    } else {
      window.open(template.canva_url, '_blank');
    }
  };

  const sliderImages = Array.isArray(template.images) && template.images.length > 0 
    ? template.images.map(image => ({ 
        url: image.url, 
        alt: image.alt || template.title || 'Template Bild'
      })) 
    : [{ url: template.thumbnail_url, alt: template.title || 'Template Vorschau' }];
  
  if (sliderImages.length === 0 || !sliderImages[0].url) {
      sliderImages[0] = { url: "/assets/images/placeholder-image.svg", alt: "Kein Bild verfügbar" };
  }

  return (
    <>
      <div className="template-card">
        <div className={`template-card-image ${imageLoading ? 'loading' : ''} ${imageError ? 'error' : ''}`}>
          {!imageError ? (
            <ImageSlider
              images={sliderImages}
              onLoad={handleImageLoad}
              onError={handleImageError}
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
          <p className="template-credit">Von: {template.credit || 'Unbekannt'}</p>
          <div className="template-actions">
            <a 
              href={template.canva_url}
              onClick={handleCanvaClick}
              className="canva-button"
              aria-label={`${template.title} in Canva öffnen`}
            >
              In Canva öffnen
            </a>
          </div>
        </div>
      </div>
      {showVerify && (
        <div className="verify-modal">
          <VerifyFeature 
            feature="templates"
            onVerified={() => {
              setShowVerify(false);
              window.open(template.canva_url, '_blank');
            }}
            onCancel={() => setShowVerify(false)}
          >
            {/* Wird nicht gerendert, da wir die Komponente anders verwenden */}
            <div />
          </VerifyFeature>
        </div>
      )}
    </>
  );
};

CanvaTemplateCard.propTypes = {
  template: PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    description: PropTypes.string,
    categories: PropTypes.arrayOf(PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    })),
    images: PropTypes.arrayOf(PropTypes.shape({
      url: PropTypes.string.isRequired,
      alt: PropTypes.string,
    })),
    canva_url: PropTypes.string.isRequired,
    tags: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
        name: PropTypes.string.isRequired,
    })),
    credit: PropTypes.string,
    thumbnail_url: PropTypes.string,
  }).isRequired
};

export default CanvaTemplateCard; 