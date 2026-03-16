// Utility helpers for DocumentOverview (frontend)

export const truncateForPreview = (content: string | null | undefined, maxLength = 300): string => {
  if (!content || typeof content !== 'string') return '';
  if (content.length <= maxLength) return content;

  const truncated = content.substring(0, maxLength);
  const lastSentence = truncated.lastIndexOf('.');
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSentence > maxLength * 0.7) {
    return truncated.substring(0, lastSentence + 1);
  } else if (lastSpace > maxLength * 0.8) {
    return truncated.substring(0, lastSpace) + '...';
  } else {
    return truncated + '...';
  }
};

// Cache for memoized markdown stripping - prevents expensive regex operations on re-renders
const stripMarkdownCache = new Map<string, string>();
const CACHE_MAX_SIZE = 500;

export const stripMarkdownForPreview = (
  content: string | null | undefined,
  maxLength = 300
): string => {
  if (!content || typeof content !== 'string') return '';

  // Create cache key from content hash (first 100 chars + length for uniqueness)
  const cacheKey = `${content.slice(0, 100)}_${content.length}_${maxLength}`;

  // Return cached result if available
  if (stripMarkdownCache.has(cacheKey)) {
    return stripMarkdownCache.get(cacheKey)!;
  }

  const cleaned = content
    .replace(/^#{1,6}\s+/gm, '') // # Headers
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1') // ***bold+italic***
    .replace(/\*\*([^*]+)\*\*/g, '$1') // **bold**
    .replace(/\*([^*]+)\*/g, '$1') // *italic*
    .replace(/__([^_]+)__/g, '$1') // __bold__
    .replace(/_([^_]+)_/g, '$1') // _italic_
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url)
    .replace(/`([^`]+)`/g, '$1') // `code`
    .replace(/^[-*+]\s+/gm, '') // - list items
    .replace(/^\d+\.\s+/gm, '') // 1. numbered lists
    .replace(/^>\s+/gm, '') // > blockquotes
    .replace(/~~([^~]+)~~/g, '$1') // ~~strikethrough~~
    .trim();

  const result = truncateForPreview(cleaned, maxLength);

  // Cache the result (with size limit to prevent memory leaks)
  if (stripMarkdownCache.size >= CACHE_MAX_SIZE) {
    // Clear oldest entries (simple strategy: clear first 100)
    const keys = Array.from(stripMarkdownCache.keys()).slice(0, 100);
    keys.forEach((key) => stripMarkdownCache.delete(key));
  }
  stripMarkdownCache.set(cacheKey, result);

  return result;
};

export const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return '';
  try {
    return new Date(dateString).toLocaleString('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return String(dateString);
  }
};

interface ItemRecord {
  name?: string;
  description?: string;
  custom_prompt?: string;
  title?: string;
  content_preview?: string;
  full_content?: string;
  document_count?: number;
  view_count?: number;
  word_count?: number;
  similarity_score?: number;
  created_at?: string;
  updated_at?: string;
  relevantText?: string;
  [key: string]: unknown;
}

export const getSearchValueFactory = (
  itemType: string
): ((item: ItemRecord, field: string) => string) => {
  return (item: ItemRecord, field: string): string => {
    if (itemType === 'notebook') {
      switch (field) {
        case 'title':
          return item.name || '';
        case 'content_preview':
          return item.description || '';
        case 'full_content':
          return item.custom_prompt || '';
        default:
          return (item[field] as string) || '';
      }
    }
    return (item[field] as string) || '';
  };
};

export const getSortValueFactory = (
  itemType: string
): ((item: ItemRecord, field: string) => string | number | Date) => {
  return (item: ItemRecord, field: string): string | number | Date => {
    if (itemType === 'notebook') {
      switch (field) {
        case 'title':
          return (item.name || '').toLowerCase();
        case 'word_count':
          return item.document_count || 0;
        case 'view_count':
          return item.view_count || 0;
        case 'created_at':
          return item.created_at ? new Date(item.created_at) : new Date(0);
        case 'updated_at':
          return item.updated_at ? new Date(item.updated_at) : new Date(0);
        default:
          return (item[field] as string) || '';
      }
    }

    switch (field) {
      case 'title':
        return (item.title || '').toLowerCase();
      case 'word_count':
        return item.word_count || 0;
      case 'similarity_score':
        return item.similarity_score ?? 0;
      case 'created_at':
        return item.created_at ? new Date(item.created_at) : new Date(0);
      case 'updated_at':
        return item.updated_at ? new Date(item.updated_at) : new Date(0);
      default:
        return (item[field] as string) || '';
    }
  };
};

export const normalizeRemoteResults = (remoteResults: ItemRecord[] = []): ItemRecord[] => {
  return (remoteResults || []).map((item) => ({
    ...item,
    content_preview:
      item.content_preview || (item.relevantText as string) || item.full_content || '',
  }));
};
