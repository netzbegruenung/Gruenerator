import { IoHeart, IoHeartOutline } from 'react-icons/io5';

import type { JSX, ReactNode, MouseEvent } from 'react';
import '../../assets/styles/components/common/index-card.css';

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

const IndexCard = ({
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
  ...props
}: IndexCardProps): JSX.Element => {
  const handleKeyPress = (e: React.KeyboardEvent<HTMLDivElement>) => {
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
  const variantClass = variant !== 'default' ? `index-card--${variant}` : '';
  const clickableClass = !isClickable ? 'index-card--non-clickable' : '';
  const imageClass = hasImage ? 'index-card--has-image' : '';

  return (
    <div
      className={`index-card ${variantClass} ${clickableClass} ${imageClass} ${className}`}
      onClick={isClickable ? onClick : undefined}
      onKeyPress={isClickable ? handleKeyPress : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      {...props}
    >
      {thumbnailUrl && (
        <div className="index-card__image">
          <img src={thumbnailUrl} alt={imageAlt || title} loading="lazy" />
          {onLikeToggle != null && (
            <button
              type="button"
              className={`index-card__like-button ${isLiked ? 'index-card__like-button--liked' : ''}`}
              onClick={handleLikeClick}
              aria-label={isLiked ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
            >
              {isLiked ? <IoHeart /> : <IoHeartOutline />}
            </button>
          )}
        </div>
      )}

      <div className="index-card__body">
        <div className="index-card__header">
          <h3 className="index-card__title">{title}</h3>
          {headerActions && <div className="index-card__header-actions">{headerActions}</div>}
        </div>

        <div className="index-card__content">
          {description && <p className="index-card__description">{description}</p>}
        </div>

        {tags.length > 0 && (
          <div className="index-card__tags">
            {tags.map((tag, index) => (
              <span
                key={index}
                className={`index-card__tag ${onTagClick != null ? 'index-card__tag--clickable' : ''}`}
                onClick={onTagClick != null ? (e) => handleTagClick(e, tag) : undefined}
                role={onTagClick != null ? 'button' : undefined}
                tabIndex={onTagClick != null ? 0 : undefined}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {authorName && (
          <div className="index-card__author">
            {authorEmail ? (
              <a
                href={`mailto:${authorEmail}`}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              >
                {authorName}
              </a>
            ) : (
              <span>{authorName}</span>
            )}
          </div>
        )}

        {meta && <div className="index-card__meta">{meta}</div>}
      </div>
    </div>
  );
};

export default IndexCard;
