import React from 'react';
import PropTypes from 'prop-types';

const formatDate = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('de-DE');
  } catch (err) {
    return String(value);
  }
};

export const GalleryCard = ({ title, description, meta, tags, onClick, className, thumbnailUrl }) => {
  const handleKeyPress = (event) => {
    if (!onClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick(event);
    }
  };

  return (
    <div
      className={`gallery-item-card${className ? ` ${className}` : ''}${thumbnailUrl ? ' has-thumbnail' : ''}`}
      onClick={onClick}
      role={onClick ? 'link' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyPress={handleKeyPress}
    >
      {thumbnailUrl && (
        <div className="gallery-card-thumbnail">
          <img src={thumbnailUrl} alt={title || ''} loading="lazy" />
        </div>
      )}
      <div className="gallery-card-content">
        {title && <h3 className="antrag-card-title">{title}</h3>}
        {description && (
          <p className="antrag-card-description">{description}</p>
        )}
        {Array.isArray(tags) && tags.length > 0 && (
          <div className="antrag-card-tags">
            {tags.map((tag) => (
              <span key={tag} className="antrag-card-tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
      {meta && <p className="antrag-card-date">{meta}</p>}
    </div>
  );
};

GalleryCard.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  meta: PropTypes.string,
  tags: PropTypes.arrayOf(PropTypes.string),
  onClick: PropTypes.func,
  className: PropTypes.string,
  thumbnailUrl: PropTypes.string
};

GalleryCard.defaultProps = {
  title: '',
  description: '',
  meta: '',
  tags: [],
  onClick: undefined,
  className: '',
  thumbnailUrl: ''
};

export const GallerySkeleton = ({ className }) => (
  <div className={`gallery-item-card skeleton${className ? ` ${className}` : ''}`}>
    <div className="skeleton-line skeleton-title" />
    <div className="skeleton-line skeleton-text" />
    <div className="skeleton-line skeleton-text" />
  </div>
);

GallerySkeleton.propTypes = {
  className: PropTypes.string
};

GallerySkeleton.defaultProps = {
  className: ''
};

export const cardAdapters = {
  antraege: (item) => {
    const tags = Array.isArray(item.tags) ? item.tags.slice(0, 3) : [];
    const hasMoreTags = Array.isArray(item.tags) && item.tags.length > 3;

    const handleNavigation = () => {
      if (typeof window === 'undefined') return;
      window.open(`/datenbank/antraege/${item.id}`, '_blank', 'noopener,noreferrer');
    };

    return {
      key: item.id,
      props: {
        title: item.title,
        description: item.description || '',
        meta: item.created_at ? `Erstellt am: ${formatDate(item.created_at)}` : '',
        tags: hasMoreTags ? [...tags, '...'] : tags,
        onClick: handleNavigation,
        className: 'antrag-card'
      }
    };
  },
  generators: (item) => ({
    key: item.id,
    props: {
      title: item.name || item.title,
      description: item.description || item.content_data?.content || '',
      meta: item.created_at ? `Erstellt am: ${formatDate(item.created_at)}` : '',
      onClick: () => {
        if (typeof window === 'undefined') return;
        window.open(`/gruenerator/${item.slug || item.id}`, '_blank', 'noopener,noreferrer');
      },
      className: 'generator-card'
    }
  }),
  pr: (item) => {
    const rawText = item?.content_data?.content || item?.content_data?.caption || item?.description || '';
    const preview = String(rawText).slice(0, 180);

    return {
      key: item.id,
      props: {
        title: item.title,
        description: rawText ? `${preview}${rawText.length > 180 ? '...' : ''}` : '',
        meta: item.type ? `${item.type} · ${formatDate(item.created_at)}` : formatDate(item.created_at),
        className: 'pr-card'
      }
    };
  },
  vorlagen: (item) => {
    if (!item?.id) return null;
    const templateType = item.template_type
      ? item.template_type.charAt(0).toUpperCase() + item.template_type.slice(1)
      : '';

    return {
      key: item.id,
      props: {
        title: item.title || 'Unbenannte Vorlage',
        description: item.description || '',
        meta: templateType || '',
        tags: Array.isArray(item.categories) ? item.categories.slice(0, 3) : [],
        thumbnailUrl: item.thumbnail_url || '',
        onClick: () => {
          if (typeof window === 'undefined') return;
          const url = item.content_data?.originalUrl || item.external_url;
          if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
          }
        },
        className: 'vorlagen-card'
      }
    };
  },
  default: (item) => ({
    key: item.id,
    props: {
      title: item.title,
      description: item.description || '',
      meta: item.created_at ? formatDate(item.created_at) : ''
    }
  })
};
