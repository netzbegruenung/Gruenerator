import { IoHeart, IoHeartOutline } from 'react-icons/io5';
import { memo, type JSX, type ReactNode } from 'react';

import { cn } from '@/utils/cn';
import { Badge } from '@/components/ui/badge';

export interface IndexCardProps {
  id?: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  tags?: string[];
  headerActions?: ReactNode;
  onClick?: (event: React.MouseEvent | React.KeyboardEvent) => void;
  className?: string;
  variant?: 'default' | 'elevated' | 'subtle';
  thumbnailUrl?: string;
  imageAlt?: string;
  authorName?: string;
  authorEmail?: string;
  onTagClick?: (tag: string) => void;
  isLiked?: boolean;
  onLikeToggle?: (id: string) => void;
}

const IndexCard = memo(({
  id,
  title,
  description,
  meta,
  tags = [],
  headerActions,
  onClick,
  className = '',
  variant = 'default',
  thumbnailUrl,
  imageAlt = '',
  authorName,
  authorEmail,
  onTagClick,
  isLiked = false,
  onLikeToggle,
}: IndexCardProps): JSX.Element => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick(e);
    }
  };

  const handleTagClick = (e: React.MouseEvent<HTMLSpanElement>, tag: string) => {
    if (onTagClick) {
      e.stopPropagation();
      onTagClick(tag);
    }
  };

  const handleLikeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onLikeToggle && id) {
      onLikeToggle(id);
    }
  };

  const isClickable = !!onClick;
  const hasImage = !!thumbnailUrl;

  return (
    <div
      className={cn(
        'flex flex-col bg-background border border-grey-200 dark:border-grey-700 rounded-md shadow-card-subtle h-full',
        isClickable && 'cursor-pointer',
        !isClickable && 'cursor-default',
        variant === 'elevated' && 'shadow-card-subtle',
        variant === 'subtle' && 'bg-background-alt border-transparent',
        hasImage ? 'p-0' : 'p-lg max-md:p-md',
        className,
      )}
      onClick={isClickable ? onClick : undefined}
      onKeyDown={isClickable ? handleKeyDown : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
    >
      {thumbnailUrl && (
        <div className="relative w-full aspect-video overflow-hidden bg-background-alt rounded-t-md">
          <img
            src={thumbnailUrl}
            alt={imageAlt || title}
            loading="lazy"
            className="w-full h-full object-contain"
          />
          {onLikeToggle != null && (
            <button
              type="button"
              className={cn(
                'absolute top-sm right-sm w-9 h-9 border-none rounded-full bg-white/90 text-grey-400 cursor-pointer flex items-center justify-center text-xl shadow-sm',
                isLiked && 'text-primary-600',
                isLiked && 'hover:text-primary-700',
              )}
              onClick={handleLikeClick}
              aria-label={isLiked ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
            >
              {isLiked ? <IoHeart /> : <IoHeartOutline />}
            </button>
          )}
        </div>
      )}

      <div className={cn(
        'flex flex-col flex-1',
        hasImage && 'p-lg max-md:p-md',
      )}>
        <div className="flex justify-between items-start mb-md">
          <h3 className="text-xl max-md:text-lg font-semibold text-foreground-heading m-0 flex-1">
            {title}
          </h3>
          {headerActions && <div className="ml-sm">{headerActions}</div>}
        </div>

        <div className="flex-1 mb-md">
          {description && (
            <p className="text-foreground leading-relaxed m-0">{description}</p>
          )}
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-xs mb-sm">
            {tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className={cn(
                  'bg-secondary-600 text-white border-transparent',
                  onTagClick != null && 'cursor-pointer transition-colors duration-200 hover:bg-primary-500 hover:text-white focus:outline-2 focus:outline-primary-600 focus:outline-offset-1',
                )}
                onClick={onTagClick != null ? (e: React.MouseEvent<HTMLSpanElement>) => handleTagClick(e, tag) : undefined}
                role={onTagClick != null ? 'button' : undefined}
                tabIndex={onTagClick != null ? 0 : undefined}
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {authorName && (
          <div className="text-sm text-foreground mb-sm">
            {authorEmail ? (
              <a
                href={`mailto:${authorEmail}`}
                className="text-primary-600 no-underline hover:underline"
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              >
                {authorName}
              </a>
            ) : (
              <span>{authorName}</span>
            )}
          </div>
        )}

        {meta && (
          <div className="flex justify-between items-center text-foreground text-sm pt-sm border-t border-grey-200 dark:border-grey-700">
            {meta}
          </div>
        )}
      </div>
    </div>
  );
}, (prev, next) => {
  return prev.title === next.title
    && prev.description === next.description
    && prev.meta === next.meta
    && prev.className === next.className
    && prev.thumbnailUrl === next.thumbnailUrl
    && prev.isLiked === next.isLiked
    && prev.id === next.id
    && prev.variant === next.variant
    && prev.authorName === next.authorName
    && prev.authorEmail === next.authorEmail;
});

IndexCard.displayName = 'IndexCard';

export default IndexCard;
