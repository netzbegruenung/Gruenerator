import React, { useCallback, useMemo, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useSharepicGeneratorContext } from '../Sharepic/SharepicGeneratorContext';
import '../../../assets/styles/components/unsplash.css';



const UnsplashImageSelector = ({ onSelect }) => {
  const { state } = useSharepicGeneratorContext();
  const { unsplashImages, isLoadingUnsplashImages, unsplashError, selectedImage } = state;

  const handleImageSelect = useCallback((image) => {
    onSelect(image);
  }, [onSelect]);

   // Verwende den useEffect-Hook, um die Bilder anzuzeigen, wenn sie geladen sind
   useEffect(() => {
    if (!isLoadingUnsplashImages && unsplashImages.length > 0) {
      const images = document.querySelectorAll('.image-item img');
      images.forEach((image, index) => {
        setTimeout(() => {
          image.classList.add('show');
        }, index * 100); // Verzögerung von 100ms pro Bild
      });
    }
  }, [isLoadingUnsplashImages, unsplashImages]);

  const renderContent = useMemo(() => {
    if (isLoadingUnsplashImages) {
      return <div className="unsplash-image-selector">Lade Bilder...</div>;
    }

    if (unsplashError && (!unsplashImages || unsplashImages.length === 0)) {
      return <div className="unsplash-image-selector">Fehler beim Laden der Bilder: {unsplashError}</div>;
    }

    if (!unsplashImages || unsplashImages.length === 0) {
      return <div className="unsplash-image-selector">Keine Bilder gefunden.</div>;
    }

    return (
      <div className="unsplash-image-selector">
        <h4>Wähle ein Bild aus:</h4>
        <div className="image-grid">
          {unsplashImages.map((image) => (
            <div
              key={image.id}
              className={`image-item ${selectedImage && selectedImage.id === image.id ? 'selected' : ''}`}
              onClick={() => handleImageSelect(image)}
              onKeyPress={(e) => e.key === 'Enter' && handleImageSelect(image)}
              tabIndex={0}
              role="button"
              aria-label={`Wähle Bild von ${image.photographerName}`}
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
  }, [unsplashImages, isLoadingUnsplashImages, unsplashError, selectedImage, handleImageSelect]);

  return renderContent;
};

UnsplashImageSelector.propTypes = {
  onSelect: PropTypes.func.isRequired,
  selectedImage: PropTypes.object,

};

export default React.memo(UnsplashImageSelector);