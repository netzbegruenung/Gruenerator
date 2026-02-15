const formatDate = (value: string | Date | null | undefined): string => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('de-DE');
  } catch (err) {
    return String(value);
  }
};

interface GallerySkeletonProps {
  className?: string;
}

export const GallerySkeleton = ({ className }: GallerySkeletonProps) => (
  <div className={`gallery-item-card skeleton${className ? ` ${className}` : ''}`}>
    <div className="skeleton-line skeleton-title" />
    <div className="skeleton-line skeleton-text" />
    <div className="skeleton-line skeleton-text" />
  </div>
);

interface CardAdapterOptions {
  onTagClick?: (tag: string) => void;
  onOpenPreview?: (item: GalleryItem) => void;
}

interface CardAdapterResult {
  key: string;
  props: Record<string, unknown>;
}

export interface GalleryItem {
  id?: string;
  prompt_id?: string;
  title?: string;
  name?: string;
  description?: string;
  created_at?: string;
  type?: string;
  slug?: string;
  tags?: string[];
  template_type?: string;
  thumbnail_url?: string;
  external_url?: string;
  prompt?: string;
  prompt_preview?: string;
  owner_first_name?: string;
  content_data?: {
    content?: string;
    caption?: string;
    originalUrl?: string;
  };
  metadata?: {
    author_name?: string;
    contact_email?: string;
  };
  [key: string]: unknown;
}

type CardAdapter = (item: GalleryItem, options?: CardAdapterOptions) => CardAdapterResult | null;

export const cardAdapters: Record<string, CardAdapter> = {
  antraege: (item) => {
    const tags = Array.isArray(item.tags) ? item.tags.slice(0, 3) : [];
    const hasMoreTags = Array.isArray(item.tags) && item.tags.length > 3;

    const handleNavigation = () => {
      if (typeof window === 'undefined') return;
      window.open(`/datenbank/antraege/${item.id}`, '_blank', 'noopener,noreferrer');
    };

    return {
      key: String(item.id),
      props: {
        title: item.title || '',
        description: item.description || '',
        meta: item.created_at ? `Erstellt am: ${formatDate(item.created_at)}` : '',
        tags: hasMoreTags ? [...tags, '...'] : tags,
        onClick: handleNavigation,
        className: 'antrag-card',
      },
    };
  },
  generators: (item) => ({
    key: String(item.id),
    props: {
      title: item.name || item.title || '',
      description: item.description || item.content_data?.content || '',
      meta: item.created_at ? `Erstellt am: ${formatDate(item.created_at)}` : '',
      onClick: () => {
        if (typeof window === 'undefined') return;
        window.open(`/gruenerator/${item.slug || item.id}`, '_blank', 'noopener,noreferrer');
      },
      className: 'generator-card',
    },
  }),
  pr: (item) => {
    const rawText =
      item?.content_data?.content || item?.content_data?.caption || item?.description || '';
    const preview = String(rawText).slice(0, 180);

    return {
      key: String(item.id),
      props: {
        title: item.title || '',
        description: rawText ? `${preview}${String(rawText).length > 180 ? '...' : ''}` : '',
        meta: item.type
          ? `${item.type} · ${formatDate(item.created_at)}`
          : formatDate(item.created_at),
        className: 'pr-card',
      },
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

    const handleClick = options?.onOpenPreview
      ? () => options.onOpenPreview?.(item)
      : () => {
          if (typeof window === 'undefined') return;
          const url = item.content_data?.originalUrl || item.external_url;
          if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
          }
        };

    return {
      key: String(item.id),
      props: {
        title: item.title || 'Unbenannte Vorlage',
        description: item.description || '',
        meta: templateType || '',
        tags,
        thumbnailUrl: item.thumbnail_url || '',
        onTagClick: options?.onTagClick,
        onClick: handleClick,
        className: 'vorlagen-card',
        authorName,
        authorEmail,
      },
    };
  },
  agents: (item, options = {}) => {
    const handleClick = options?.onOpenPreview
      ? () => options.onOpenPreview?.(item)
      : () => {
          if (typeof window === 'undefined') return;
          if (item._isBuiltIn) {
            window.location.href = `/chat?agent=${item.identifier}`;
          } else {
            window.location.href = `/agent/${item.slug}`;
          }
        };

    if (item._isBuiltIn) {
      return {
        key: String(item.identifier || item.id),
        props: {
          title: `${item.avatar || ''} ${item.title || item.name || ''}`.trim(),
          description: String(item.description || ''),
          meta: 'System-Agent',
          onClick: handleClick,
          className: 'agent-card agent-card--builtin',
        },
      };
    }

    const promptText = item.prompt_preview || item.prompt || '';
    const preview =
      String(promptText).length > 150
        ? String(promptText).substring(0, 150) + '...'
        : String(promptText);

    let meta = item.owner_first_name ? `von ${item.owner_first_name}` : '';
    let className = 'agent-card';
    if (item._isOwn) {
      meta = item.is_public ? 'Eigener Agent · Öffentlich' : 'Eigener Agent';
      className = 'agent-card agent-card--own';
    } else if (item._isSaved) {
      meta = item.owner_first_name ? `Gespeichert · von ${item.owner_first_name}` : 'Gespeichert';
      className = 'agent-card agent-card--saved';
    }

    return {
      key: String(item.prompt_id || item.id),
      props: {
        title: item.name || '',
        description: preview,
        meta,
        onClick: handleClick,
        className,
      },
    };
  },
  default: (item) => ({
    key: String(item.id),
    props: {
      title: item.title || '',
      description: item.description || '',
      meta: item.created_at ? formatDate(item.created_at) : '',
    },
  }),
};
