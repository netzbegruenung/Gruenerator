import { JSX, useState } from 'react';
import ImageSlider from '../../../../../components/common/ImageSlider';
import VerifyFeature from '../../../../../components/common/VerifyFeature';

interface TemplateImage {
  url: string;
  alt?: string;
}

interface CanvaTemplate {
  canva_url: string;
  title?: string;
  description?: string;
  credit?: string;
  thumbnail_url?: string;
  images?: TemplateImage[];
}

interface CanvaTemplateCardProps {
  template: CanvaTemplate;
}

const CanvaTemplateCard = ({ template }: CanvaTemplateCardProps): JSX.Element => {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [showVerify, setShowVerify] = useState(false);
  // Feature verification is handled by VerifyFeature component
  const [isVerified, setIsVerified] = useState(false);

  const handleImageLoad = () => {
    setImageLoading(false);
  };

  const handleImageError = () => {
    setImageError(true);
    setImageLoading(false);
  };

  const handleCanvaClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (!isVerified) {
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
              setIsVerified(true);
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

export default CanvaTemplateCard;
