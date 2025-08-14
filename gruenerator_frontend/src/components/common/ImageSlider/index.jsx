import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { HiRefresh } from 'react-icons/hi';

// Lazy load react-image-gallery and its styles
const loadImageGallery = async () => {
  const [galleryModule, styleSheet] = await Promise.all([
    import('react-image-gallery'),
    import('react-image-gallery/styles/css/image-gallery.css')
  ]);
  
  return galleryModule.default;
};

const ImageSlider = ({ 
  images, 
  onImageClick,
  onLoad,
  onError,
  className = '',
  showControls = true
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [ImageGallery, setImageGallery] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Load image gallery component when needed
  const handleLoadGallery = useCallback(async () => {
    if (ImageGallery || isLoading) return;
    
    setIsLoading(true);
    setLoadError(null);
    
    try {
      const GalleryComponent = await loadImageGallery();
      setImageGallery(() => GalleryComponent);
    } catch (error) {
      console.error('Failed to load image gallery:', error);
      setLoadError(error);
    } finally {
      setIsLoading(false);
    }
  }, [ImageGallery, isLoading]);

  // Auto-load when component mounts
  useEffect(() => {
    handleLoadGallery();
  }, [handleLoadGallery]);

  const galleryImages = images.map(img => ({
    original: img.url || img.src,
    originalAlt: img.alt
  }));

  const handleClick = (event) => {
    // Nur wenn direkt auf das Bild geklickt wurde (nicht auf die Navigationspfeile)
    if (event.target.classList.contains('image-gallery-image')) {
      setIsFullscreen(true);
    }
    if (onImageClick) {
      onImageClick(event);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className={`image-slider ${className}`} style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '200px',
        opacity: 0.7
      }}>
        <HiRefresh className="spinning" size={24} />
        <span style={{ marginLeft: '8px', fontSize: '14px' }}>Bildergalerie wird geladen...</span>
      </div>
    );
  }

  // Error state
  if (loadError || !ImageGallery) {
    return (
      <div className={`image-slider ${className}`} style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '200px',
        opacity: 0.5,
        flexDirection: 'column'
      }}>
        <p style={{ fontSize: '14px', textAlign: 'center' }}>
          Bildergalerie konnte nicht geladen werden
        </p>
        <button 
          onClick={handleLoadGallery}
          style={{ 
            marginTop: '8px', 
            padding: '4px 8px', 
            fontSize: '12px',
            background: 'var(--tanne)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Erneut versuchen
        </button>
      </div>
    );
  }

  // Render the loaded image gallery
  return (
    <div className={`image-slider ${className}`}>
      <ImageGallery
        items={galleryImages}
        showThumbnails={false}
        showFullscreenButton={false}
        showPlayButton={false}
        showBullets={galleryImages.length > 1}
        showNav={showControls && galleryImages.length > 1}
        onClick={handleClick}
        onImageLoad={onLoad}
        onImageError={onError}
        lazyLoad={true}
        slideDuration={300}
        additionalClass="template-gallery-slider"
        isFullscreen={isFullscreen}
        onScreenChange={setIsFullscreen}
        useBrowserFullscreen={false}
      />
    </div>
  );
};

ImageSlider.propTypes = {
  images: PropTypes.arrayOf(PropTypes.shape({
    url: PropTypes.string,
    src: PropTypes.string,
    alt: PropTypes.string.isRequired,
  }).isRequired).isRequired,
  onImageClick: PropTypes.func,
  onLoad: PropTypes.func,
  onError: PropTypes.func,
  className: PropTypes.string,
  showControls: PropTypes.bool
};

export default ImageSlider;