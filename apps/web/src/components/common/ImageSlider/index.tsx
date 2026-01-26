import { type JSX, useState, useEffect, useCallback } from 'react';
import { HiRefresh } from 'react-icons/hi';
import '../../../assets/styles/components/ui/image-slider.css';

// Lazy load react-image-gallery and its styles
const loadImageGallery = async () => {
  const [galleryModule, _styleSheet] = await Promise.all([
    // @ts-expect-error - react-image-gallery types are missing
    import('react-image-gallery'),
    // @ts-expect-error - CSS import
    import('react-image-gallery/styles/css/image-gallery.css'),
  ]);

  return galleryModule.default;
};

interface ImageSliderProps {
  images: {
    url?: string;
    src?: string;
    alt?: string;
  }[];
  onImageClick?: (event?: React.MouseEvent) => void;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  className?: string;
  showControls?: boolean;
}

const ImageSlider = ({
  images,
  onImageClick,
  onLoad,
  onError,
  className = '',
  showControls = true,
}: ImageSliderProps): JSX.Element => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [ImageGallery, setImageGallery] = useState<React.ComponentType<
    Record<string, unknown>
  > | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<Error | unknown | null>(null);

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

  const galleryImages = images.map((img) => ({
    original: img.url || img.src,
    originalAlt: img.alt,
  }));

  const handleClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    // Nur wenn direkt auf das Bild geklickt wurde (nicht auf die Navigationspfeile)
    if ((event.target as HTMLElement).classList.contains('image-gallery-image')) {
      setIsFullscreen(true);
    }
    if (onImageClick) {
      onImageClick(event as React.MouseEvent<HTMLImageElement>);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div
        className={`image-slider ${className}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '200px',
          opacity: 0.7,
        }}
      >
        <HiRefresh className="spinning" size={24} />
        <span style={{ marginLeft: '8px', fontSize: '14px' }}>Bildergalerie wird geladen...</span>
      </div>
    );
  }

  // Error state
  if (loadError || !ImageGallery) {
    return (
      <div
        className={`image-slider ${className}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '200px',
          opacity: 0.5,
          flexDirection: 'column',
        }}
      >
        <p style={{ fontSize: '14px', textAlign: 'center' }}>
          Bildergalerie konnte nicht geladen werden
        </p>
        <button
          onClick={handleLoadGallery}
          style={{
            marginTop: '8px',
            padding: '4px 8px',
            fontSize: '12px',
            background: 'var(--button-color)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
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
      {ImageGallery && (
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
      )}
    </div>
  );
};

export default ImageSlider;
