import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@gruenerator/ui';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { HiExternalLink, HiChevronLeft, HiChevronRight } from 'react-icons/hi';
import { HiOutlineArrowDownTray } from 'react-icons/hi2';

import FavoriteButton from '../FavoriteButton';
import LikeButton from '../LikeButton';

import { CanvaLogo } from '@/features/canva/components/CanvaLogo';
import { cn } from '@/utils/cn';

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
  id?: string | number;
  content_data?: TemplateContentData;
  metadata?: TemplateMetadata;
  external_url?: string;
  download_url?: string;
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
  // Like (public heart + count)
  liked?: boolean;
  likeCount?: number;
  onToggleLike?: () => void;
  likeToggling?: boolean;
  canLike?: boolean;
  // Favorite (personal star bookmark)
  favorited?: boolean;
  onToggleFavorite?: () => void;
  favoriteToggling?: boolean;
  canFavorite?: boolean;
}

const TemplatePreviewModal = ({
  isOpen,
  onClose,
  template,
  onTagClick,
  liked = false,
  likeCount = 0,
  onToggleLike,
  likeToggling = false,
  canLike = false,
  favorited = false,
  onToggleFavorite,
  favoriteToggling = false,
  canFavorite = false,
}: TemplatePreviewModalProps): React.ReactNode => {
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const allImages = useMemo(() => {
    const images: Array<{ url: string; title: string }> = [];
    const images_array = (template as Record<string, unknown>)?.images;
    if (Array.isArray(images_array)) {
      const sorted = Array.from(images_array).sort((a, b) => {
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

  // Reset index when template changes — derive safe index
  const safeImageIndex = activeImageIndex < allImages.length ? activeImageIndex : 0;
  const currentImage = allImages[safeImageIndex] || allImages[0];

  // Reset to first image when switching templates
  const [prevTemplateId, setPrevTemplateId] = useState(template?.id);
  if (template?.id !== prevTemplateId) {
    setPrevTemplateId(template?.id);
    setActiveImageIndex(0);
  }

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
    const url =
      template?.content_data?.originalUrl || template?.external_url || template?.download_url;
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
  // The single openable target, in priority order. When none exists (e.g. a
  // file template still being processed) the footer action is hidden entirely
  // instead of rendering a button that does nothing.
  const openUrl =
    template.content_data?.originalUrl || template.external_url || template.download_url || '';
  const isDownloadOnly =
    !template.content_data?.originalUrl && !template.external_url && Boolean(template.download_url);

  const actionBar =
    onToggleLike || onToggleFavorite ? (
      <div className="flex shrink-0 items-center justify-center gap-sm border-t border-grey-200 bg-background px-md py-sm dark:border-grey-700">
        {onToggleLike && (
          <LikeButton
            size="lg"
            showLabel
            liked={liked}
            count={likeCount}
            onToggle={onToggleLike}
            loading={likeToggling}
            disabled={!canLike}
            disabledReason={!canLike ? 'Melde dich an, um zu liken' : undefined}
          />
        )}
        {onToggleFavorite && (
          <FavoriteButton
            size="lg"
            showLabel
            favorited={favorited}
            onToggle={onToggleFavorite}
            loading={favoriteToggling}
            disabled={!canFavorite}
            disabledReason={!canFavorite ? 'Melde dich an, um zu merken' : undefined}
          />
        )}
      </div>
    ) : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex w-full flex-col sm:max-w-[900px] max-h-[90vh] sm:max-h-[85vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-lg py-md border-b border-grey-200 dark:border-grey-700">
          <DialogTitle className="truncate pr-lg">{template.title || 'Vorlage'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
          {/* Cap the image column at 60% so wide/landscape previews can't crowd out the
              sidebar. The column keeps an `auto` basis, so narrow/portrait images still
              size snugly — the cap only bites when the image would otherwise overflow. */}
          <div className="flex flex-col bg-background-alt min-h-0 min-w-0 md:max-w-[60%]">
            {currentImage?.url ? (
              <>
                <div className="relative flex flex-1 items-center justify-center p-md min-h-0">
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
                    className="max-w-full max-h-[calc(85vh-260px)] max-md:max-h-[38vh] w-auto h-auto object-contain rounded-sm"
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
                          index === activeImageIndex && 'border-primary-500'
                        )}
                        onClick={() => setActiveImageIndex(index)}
                        aria-label={`Bild ${index + 1}`}
                      >
                        <img src={img.url} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-grey-500 text-sm min-h-[200px] md:min-w-[320px] max-md:min-h-[150px]">
                <span>Keine Vorschau verfügbar</span>
              </div>
            )}

            {/* Prominent like/merken action bar — sits directly under the preview. */}
            {actionBar}
          </div>

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
                      onTagClick &&
                        'cursor-pointer transition-colors duration-200 hover:bg-primary-500 hover:text-white'
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
                  {isCanva && <CanvaLogo size={14} />}
                  {templateType}
                </Badge>
              )}
              {dimensions && (
                <span className="font-mono text-xs">
                  {dimensions.width} × {dimensions.height}
                </span>
              )}
              {template.created_at && <span>{formatDate(template.created_at)}</span>}
            </div>
          </div>
        </div>

        {openUrl && (
          <DialogFooter className="px-lg py-md border-t border-grey-200 dark:border-grey-700 sm:justify-end shrink-0">
            <Button onClick={handleOpenExternal} className="max-sm:w-full">
              {isCanva ? (
                <>
                  <CanvaLogo size={16} />
                  <span>In Canva öffnen</span>
                </>
              ) : isDownloadOnly ? (
                <>
                  <HiOutlineArrowDownTray />
                  <span>Herunterladen</span>
                </>
              ) : (
                <>
                  <HiExternalLink />
                  <span>Öffnen</span>
                </>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TemplatePreviewModal;
