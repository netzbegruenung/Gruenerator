import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import '../../../assets/styles/components/unsplash.css';

const UnsplashImageSelector = ({ images, onSelect, loading, error, forceUpdateKey }) => {
  const [selectedImageId, setSelectedImageId] = useState(null);
  const [clickTimeout, setClickTimeout] = useState(null);
  const [localImages, setLocalImages] = useState(images);

  useEffect(() => {
    console.log('UnsplashImageSelector: forceUpdateKey or images changed', { forceUpdateKey, imagesCount: images.length });
    setLocalImages(images);
  }, [images, forceUpdateKey]);

  console.log('UnsplashImageSelector: Image URLs', localImages.map(img => img.previewUrl));
  console.log('UnsplashImageSelector: Rendering with props', {
    imagesCount: localImages.length,
    hasOnSelect: !!onSelect,
    forceUpdateKey
  });

  const handleMouseDown = (image) => {
    const timeout = setTimeout(() => {
      window.open(image.fullImageUrl, '_blank');
    }, 800); // 800ms für langes Klicken
    setClickTimeout(timeout);
  };

  const handleMouseUp = (image) => {
    if (clickTimeout) {
      clearTimeout(clickTimeout);
      setClickTimeout(null);
      setSelectedImageId(image.id);
      onSelect(image); // kurzes Klicken
    }
  };

  if (loading) {
    return <div className="unsplash-image-selector">Lade Bilder...</div>;
  }

  if (error) {
    return <div className="unsplash-image-selector">Fehler beim Laden der Bilder: {error}</div>;
  }

  if (!localImages || localImages.length === 0) {
    return <div className="unsplash-image-selector">Keine Bilder gefunden.</div>;
  }

  return (
    <div className="unsplash-image-selector">
      <h4>Wähle ein Bild aus:</h4>
      <div className="image-grid">
        {localImages.map((image) => (
          <div
            key={image.id}
            className={`image-item ${selectedImageId === image.id ? 'selected' : ''}`}
            onMouseDown={() => handleMouseDown(image)}
            onMouseUp={() => handleMouseUp(image)}
          >
            <img
              src={image.previewUrl}
              alt={`Bild von ${image.photographerName}`}
              loading="lazy"
            />
            <div className="image-attribution">
              <a href={`https://unsplash.com/@${image.photographerUsername}?utm_source=your_app_name&utm_medium=referral`} target="_blank" rel="noopener noreferrer">
                {image.photographerName}
              </a>
              {' '}auf{' '}
              <a href="https://unsplash.com/?utm_source=your_app_name&utm_medium=referral" target="_blank" rel="noopener noreferrer">
                Unsplash
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

UnsplashImageSelector.propTypes = {
  images: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    previewUrl: PropTypes.string.isRequired,
    photographerName: PropTypes.string.isRequired,
    photographerUsername: PropTypes.string.isRequired,
  })).isRequired,
  onSelect: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  error: PropTypes.string,
  forceUpdateKey: PropTypes.number, // Neue Prop
};

export default UnsplashImageSelector;