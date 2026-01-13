import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { HiX, HiExternalLink, HiChevronLeft, HiChevronRight } from 'react-icons/hi';
import { SiCanva } from 'react-icons/si';
import './TemplatePreviewModal.css';

const formatDate = (value: string | number | Date | null | undefined) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch {
    return '';
  }
};

interface TemplatePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: Record<string, unknown>;
  onTagClick?: (tag: string) => void;
}

const TemplatePreviewModal = ({
  isOpen,
  onClose,
  template,
  onTagClick
}: TemplatePreviewModalProps): React.ReactNode => {
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const allImages = useMemo(() => {
    const images: Array<{ url: string; title: string }> = [];
    const images_array = (template as Record<string, unknown>)?.images;
    if (Array.isArray(images_array)) {
      const sorted = [...images_array].sort((a, b) => {
        const aOrder = (a as Record<string, unknown>)?.display_order as number | undefined || 0;
        const bOrder = (b as Record<string, unknown>)?.display_order as number | undefined || 0;
        return aOrder - bOrder;
      });
      sorted.forEach(img => {
        const url = (img as Record<string, unknown>)?.url;
        const title = (img as Record<string, unknown>)?.title as string | undefined;
        if (url) images.push({ url: url as string, title: title || '' });
      });
    }
    const thumbnail = (template as Record<string, unknown>)?.thumbnail_url as string | undefined;
    if (thumbnail && !images.some(img => img.url === thumbnail)) {
      images.unshift({ url: thumbnail, title: 'Vorschau' });
    }
    return images;
  }, [template]);

  const hasMultipleImages = allImages.length > 1;
  const currentImage = allImages[activeImageIndex] || allImages[0];

  useEffect(() => {
    setActiveImageIndex(0);
  }, [template?.id]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (hasMultipleImages) {
      if (e.key === 'ArrowLeft') {
        setActiveImageIndex(prev => (prev > 0 ? prev - 1 : allImages.length - 1));
      } else if (e.key === 'ArrowRight') {
        setActiveImageIndex(prev => (prev < allImages.length - 1 ? prev + 1 : 0));
      }
    }
  }, [onClose, hasMultipleImages, allImages.length]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  const handleOpenExternal = useCallback(() => {
    const url = template?.content_data?.originalUrl || template?.external_url;
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [template]);

  const handleTagClick = useCallback((tag: string) => {
    if (onTagClick) {
      onClose();
      onTagClick(tag);
    }
  }, [onTagClick, onClose]);

  const handlePrevImage = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveImageIndex(prev => (prev > 0 ? prev - 1 : allImages.length - 1));
  }, [allImages.length]);

  const handleNextImage = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveImageIndex(prev => (prev < allImages.length - 1 ? prev + 1 : 0));
  }, [allImages.length]);

  if (!isOpen || !template) return null;

  const templateType = template.template_type
    ? template.template_type.charAt(0).toUpperCase() + template.template_type.slice(1)
    : '';
  const isCanva = template.template_type === 'canva';
  const dimensions = template.content_data?.dimensions || template.metadata?.dimensions;
  const tags = Array.isArray(template.tags) ? template.tags : [];

  const modalContent = (
    <div className="template-preview-modal-backdrop" onClick={handleBackdropClick}>
      <div
        className="template-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-preview-title"
      >
        <div className="template-preview-modal-header">
          <h2 id="template-preview-title">{template.title || 'Vorlage'}</h2>
          <button
            className="template-preview-modal-close"
            onClick={onClose}
            aria-label="Schließen"
          >
            <HiX />
          </button>
        </div>

        <div className="template-preview-modal-body">
          <div className="template-preview-layout">
            {currentImage?.url ? (
              <div className="template-preview-image-section">
                <div className="template-preview-image-container">
                  {hasMultipleImages && (
                    <button
                      className="template-preview-nav template-preview-nav-prev"
                      onClick={handlePrevImage}
                      aria-label="Vorheriges Bild"
                    >
                      <HiChevronLeft />
                    </button>
                  )}
                  <img
                    src={currentImage.url}
                    alt={currentImage.title || template.title || 'Vorschau'}
                    className="template-preview-main-image"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  {hasMultipleImages && (
                    <button
                      className="template-preview-nav template-preview-nav-next"
                      onClick={handleNextImage}
                      aria-label="Nächstes Bild"
                    >
                      <HiChevronRight />
                    </button>
                  )}
                </div>

                {hasMultipleImages && (
                  <div className="template-preview-thumbnails">
                    {allImages.map((img, index) => (
                      <button
                        key={`thumb-${index}`}
                        className={`template-preview-thumbnail${index === activeImageIndex ? ' active' : ''}`}
                        onClick={() => setActiveImageIndex(index)}
                        aria-label={`Bild ${index + 1}`}
                      >
                        <img src={img.url} alt="" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="template-preview-no-image">
                <span>Keine Vorschau verfügbar</span>
              </div>
            )}

            <div className="template-preview-info">
              {template.description && (
                <p className="template-preview-description">{template.description}</p>
              )}

              {template.metadata?.author_name && (
                <p className="template-preview-author">
                  <strong>Autor*in:</strong> {template.metadata.author_name}
                  {template.metadata?.contact_email && (
                    <>
                      {' · '}
                      <a href={`mailto:${template.metadata.contact_email}`}>
                        {template.metadata.contact_email}
                      </a>
                    </>
                  )}
                </p>
              )}

              {tags.length > 0 && (
                <div className="template-preview-tags">
                  {tags.map((tag: string) => (
                    <span
                      key={tag}
                      className={`template-preview-tag${onTagClick ? ' clickable' : ''}`}
                      onClick={onTagClick ? () => handleTagClick(tag) : undefined}
                      role={onTagClick ? 'button' : undefined}
                      tabIndex={onTagClick ? 0 : undefined}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="template-preview-meta">
                {templateType && (
                  <span className="template-preview-type">
                    {isCanva && <SiCanva className="template-preview-type-icon" />}
                    {templateType}
                  </span>
                )}
                {dimensions && (
                  <span className="template-preview-dimensions">
                    {dimensions.width} × {dimensions.height}
                  </span>
                )}
                {template.created_at && (
                  <span className="template-preview-date">
                    {formatDate(template.created_at)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="template-preview-modal-footer">
          <button
            className="pabtn pabtn--m pabtn--primary"
            onClick={handleOpenExternal}
          >
            {isCanva ? (
              <>
                <SiCanva />
                <span>In Canva öffnen</span>
              </>
            ) : (
              <>
                <HiExternalLink />
                <span>Öffnen</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default TemplatePreviewModal;
