import React, { useState } from 'react';
import PropTypes from 'prop-types';
import ImageGallery from 'react-image-gallery';
import 'react-image-gallery/styles/css/image-gallery.css';

const ImageSlider = ({ 
  images, 
  onImageClick,
  onLoad,
  onError,
  className = '',
  showControls = true
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);

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