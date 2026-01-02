import type { ReactNode, MouseEvent } from 'react';
import '../../assets/styles/components/common/index-card.css';

interface IndexCardProps {
  title: string;
  description?: string;
  meta?: ReactNode;
  tags?: string[];
  headerActions?: ReactNode;
  onClick?: (event: React.MouseEvent) => void;
  className?: string;
  variant?: 'default' | 'elevated' | 'subtle';
  thumbnailUrl?: string;
  imageAlt?: string;
  authorName?: string;
  authorEmail?: string;
  onTagClick?: () => void;
}

const IndexCard = ({ title,
  description,
  meta = null,
  tags = [],
  headerActions = null,
  onClick = null,
  className = '',
  variant = 'default',
  thumbnailUrl = null,
  imageAlt = '',
  authorName = null,
  authorEmail = null,
  onTagClick = null,
  ...props }: IndexCardProps): JSX.Element => {
  const handleKeyPress = (e) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick(e);
    }
  };

  const handleTagClick = (e, tag) => {
    if (onTagClick) {
      e.stopPropagation();
      onTagClick(tag);
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
        </div>
      )}

      <div className="index-card__body">
        <div className="index-card__header">
          <h3 className="index-card__title">{title}</h3>
          {headerActions && (
            <div className="index-card__header-actions">{headerActions}</div>
          )}
        </div>

        <div className="index-card__content">
          {description && (
            <p className="index-card__description">{description}</p>
          )}
        </div>

        {tags.length > 0 && (
          <div className="index-card__tags">
            {tags.map((tag, index) => (
              <span
                key={index}
                className={`index-card__tag ${onTagClick ? 'index-card__tag--clickable' : ''}`}
                onClick={onTagClick ? (e) => handleTagClick(e, tag) : undefined}
                role={onTagClick ? 'button' : undefined}
                tabIndex={onTagClick ? 0 : undefined}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {authorName && (
          <div className="index-card__author">
            {authorEmail ? (
              <a href={`mailto:${authorEmail}`} onClick={(e) => e.stopPropagation()}>
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
