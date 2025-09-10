// Utility helpers for DocumentOverview (frontend)

export const truncateForPreview = (content, maxLength = 300) => {
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

export const formatDate = (dateString) => {
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

export const getSearchValueFactory = (itemType) => {
  return (item, field) => {
    if (itemType === 'qa') {
      switch (field) {
        case 'title':
          return item.name || '';
        case 'content_preview':
          return item.description || '';
        case 'full_content':
          return item.custom_prompt || '';
        default:
          return item[field] || '';
      }
    }
    return item[field] || '';
  };
};

export const getSortValueFactory = (itemType) => {
  return (item, field) => {
    if (itemType === 'qa') {
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
          return item[field] || '';
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
        return item[field] || '';
    }
  };
};

export const normalizeRemoteResults = (remoteResults = []) => {
  return (remoteResults || []).map((item) => ({
    ...item,
    content_preview: item.content_preview || item.relevantText || item.full_content || '',
  }));
};

