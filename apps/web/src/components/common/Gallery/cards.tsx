
const formatDate = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('de-DE');
  } catch (err) {
    return String(value);
  }
};

export const GallerySkeleton = ({ className }) => (
  <div className={`gallery-item-card skeleton${className ? ` ${className}` : ''}`}>
    <div className="skeleton-line skeleton-title" />
    <div className="skeleton-line skeleton-text" />
    <div className="skeleton-line skeleton-text" />
  </div>
);

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
  vorlagen: (item, options = {}) => {
    if (!item?.id) return null;
    const templateType = item.template_type
      ? item.template_type.charAt(0).toUpperCase() + item.template_type.slice(1)
      : '';
    const tags = Array.isArray(item.tags) ? item.tags.slice(0, 5) : [];
    const authorName = item.metadata?.author_name || '';
    const authorEmail = item.metadata?.contact_email || '';

    const handleClick = options.onOpenPreview
      ? () => options.onOpenPreview(item)
      : () => {
          if (typeof window === 'undefined') return;
          const url = item.content_data?.originalUrl || item.external_url;
          if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
          }
        };

    return {
      key: item.id,
      props: {
        title: item.title || 'Unbenannte Vorlage',
        description: item.description || '',
        meta: templateType || '',
        tags,
        thumbnailUrl: item.thumbnail_url || '',
        onTagClick: options.onTagClick,
        onClick: handleClick,
        className: 'vorlagen-card',
        authorName,
        authorEmail
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
