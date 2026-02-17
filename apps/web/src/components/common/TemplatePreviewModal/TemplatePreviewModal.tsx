import { useState, useCallback, useEffect, useMemo } from 'react';
import { HiExternalLink, HiChevronLeft, HiChevronRight } from 'react-icons/hi';
import { SiCanva } from 'react-icons/si';

import { cn } from '@/utils/cn';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

const formatDate = (value: string | number | Date | null | undefined) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '';
  }
};

interface TemplateContentData {
  originalUrl?: string;
  dimensions?: { width: number; height: number };
  [key: string]: unknown;
}

interface TemplateMetadata {
  dimensions?: { width: number; height: number };
  author_name?: string;
  contact_email?: string;
  [key: string]: unknown;
}

interface Template {
  id?: string;
  content_data?: TemplateContentData;
  metadata?: TemplateMetadata;
  external_url?: string;
  template_type?: string;
  tags?: string[];
  images?: Array<{ url: string; title?: string; display_order?: number }>;
  thumbnail_url?: string;
  title?: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

interface TemplatePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: Template;
  onTagClick?: (tag: string) => void;
}

const TemplatePreviewModal = ({
  isOpen,
  onClose,
  template,
  onTagClick,
}: TemplatePreviewModalProps): React.ReactNode => {
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const allImages = useMemo(() => {
    const images: Array<{ url: string; title: string }> = [];
    const images_array = (template as Record<string, unknown>)?.images;
    if (Array.isArray(images_array)) {
      const sorted = [...images_array].sort((a, b) => {
        const aOrder = ((a as Record<string, unknown>)?.display_order as number | undefined) || 0;
        const bOrder = ((b as Record<string, unknown>)?.display_order as number | undefined) || 0;
        return aOrder - bOrder;
      });
      sorted.forEach((img) => {
        const url = (img as Record<string, unknown>)?.url;
        const title = (img as Record<string, unknown>)?.title as string | undefined;
        if (url) images.push({ url: url as string, title: title || '' });
      });
    }
    const thumbnail = (template as Record<string, unknown>)?.thumbnail_url as string | undefined;
    if (thumbnail && !images.some((img) => img.url === thumbnail)) {
      images.unshift({ url: thumbnail, title: 'Vorschau' });
    }
    return images;
  }, [template]);

  const hasMultipleImages = allImages.length > 1;
  const currentImage = allImages[activeImageIndex] || allImages[0];

  useEffect(() => {
    setActiveImageIndex(0);
  }, [template?.id]);

  useEffect(() => {
    if (!isOpen || !hasMultipleImages) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : allImages.length - 1));
      } else if (e.key === 'ArrowRight') {
        setActiveImageIndex((prev) => (prev < allImages.length - 1 ? prev + 1 : 0));
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, hasMultipleImages, allImages.length]);

  const handleOpenExternal = useCallback(() => {
    const url = template?.content_data?.originalUrl || template?.external_url;
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [template]);

  const handleTagClick = useCallback(
    (tag: string) => {
      if (onTagClick) {
        onClose();
        onTagClick(tag);
      }
    },
    [onTagClick, onClose]
  );

  if (!template) return null;

  const templateType = template.template_type
    ? template.template_type.charAt(0).toUpperCase() + template.template_type.slice(1)
    : '';
  const isCanva = template.template_type === 'canva';
  const dimensions = template.content_data?.dimensions || template.metadata?.dimensions;
  const tags = Array.isArray(template.tags) ? template.tags : [];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[900px] max-h-[80vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-lg py-md border-b border-grey-200 dark:border-grey-700">
          <DialogTitle className="truncate pr-md">
            {template.title || 'Vorlage'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden min-h-0 flex">
          <div className="flex flex-col max-md:flex-col md:flex-row flex-1 min-h-0 overflow-y-auto md:overflow-hidden">
            {currentImage?.url ? (
              <div className="flex-shrink-0 bg-background-alt flex flex-col min-h-0">
                <div className="relative flex items-center justify-center p-md">
                  {hasMultipleImages && (
                    <button
                      className="absolute left-sm top-1/2 -translate-y-1/2 bg-background border-none rounded-full w-9 h-9 flex items-center justify-center cursor-pointer shadow-md text-foreground z-10"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : allImages.length - 1));
                      }}
                      aria-label="Vorheriges Bild"
                    >
                      <HiChevronLeft className="w-5 h-5" />
                    </button>
                  )}
                  <img
                    src={currentImage.url}
                    alt={currentImage.title || template.title || 'Vorschau'}
                    className="max-w-full max-h-[calc(80vh-140px)] max-md:max-h-[35vh] w-auto h-auto object-contain rounded-sm"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  {hasMultipleImages && (
                    <button
                      className="absolute right-sm top-1/2 -translate-y-1/2 bg-background border-none rounded-full w-9 h-9 flex items-center justify-center cursor-pointer shadow-md text-foreground z-10"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveImageIndex((prev) => (prev < allImages.length - 1 ? prev + 1 : 0));
                      }}
                      aria-label="Nächstes Bild"
                    >
                      <HiChevronRight className="w-5 h-5" />
                    </button>
                  )}
                </div>

                {hasMultipleImages && (
                  <div className="flex gap-sm px-md pb-md overflow-x-auto justify-center shrink-0">
                    {allImages.map((img, index) => (
                      <button
                        key={`thumb-${index}`}
                        className={cn(
                          'w-12 h-12 p-0 border-2 border-transparent rounded-md overflow-hidden cursor-pointer bg-background shrink-0',
                          index === activeImageIndex && 'border-primary-500',
                        )}
                        onClick={() => setActiveImageIndex(index)}
                        aria-label={`Bild ${index + 1}`}
                      >
                        <img src={img.url} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="shrink-0 flex items-center justify-center bg-background-alt text-grey-500 text-sm min-h-[200px] min-w-[300px] max-md:min-h-[150px] max-md:min-w-0">
                <span>Keine Vorschau verfügbar</span>
              </div>
            )}

            <div className="flex-1 p-lg max-md:p-md flex flex-col overflow-y-auto min-h-0">
              {template.description && (
                <p className="m-0 mb-md text-foreground leading-relaxed text-sm">
                  {template.description}
                </p>
              )}

              {template.metadata?.author_name && (
                <p className="m-0 mb-md text-sm text-grey-500">
                  <strong className="text-foreground font-medium">Autor*in:</strong>{' '}
                  {template.metadata.author_name}
                  {template.metadata?.contact_email && (
                    <>
                      {' · '}
                      <a
                        href={`mailto:${template.metadata.contact_email}`}
                        className="text-primary-600 no-underline hover:underline"
                      >
                        {template.metadata.contact_email}
                      </a>
                    </>
                  )}
                </p>
              )}

              {tags.length > 0 && (
                <div className="flex flex-wrap gap-sm mb-md">
                  {tags.map((tag: string) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className={cn(
                        onTagClick && 'cursor-pointer transition-colors duration-200 hover:bg-primary-500 hover:text-white',
                      )}
                      onClick={onTagClick ? () => handleTagClick(tag) : undefined}
                      role={onTagClick ? 'button' : undefined}
                      tabIndex={onTagClick ? 0 : undefined}
                    >
                      #{tag}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-sm items-center text-grey-600 dark:text-grey-400 text-xs mt-auto">
                {templateType && (
                  <Badge variant="outline" className="gap-1.5">
                    {isCanva && <SiCanva className="w-3.5 h-3.5" />}
                    {templateType}
                  </Badge>
                )}
                {dimensions && (
                  <span className="font-mono text-xs">
                    {dimensions.width} × {dimensions.height}
                  </span>
                )}
                {template.created_at && (
                  <span>{formatDate(template.created_at)}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="px-lg py-md border-t border-grey-200 dark:border-grey-700">
          <Button onClick={handleOpenExternal}>
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
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TemplatePreviewModal;
