/**
 * Document and Text Management Utilities
 *
 * This file contains business logic, constants, and utility functions
 * for document and text management operations, extracted from ContentManagementTab
 * to improve code organization and reusability.
 */

import apiClient from './apiClient';

// =====================================================================
// CONSTANTS AND TYPE DEFINITIONS
// =====================================================================

export const DOCUMENT_TYPES: Record<string, string> = {
  pdf: 'PDF-Dokument',
  document: 'Dokument',
  text: 'Text',
  upload: 'Hochgeladene Datei',
};

export const TEXT_DOCUMENT_TYPES: Record<string, string> = {
  text: 'Allgemeiner Text',
  antrag: 'Antrag',
  social: 'Social Media',
  universal: 'Universal',
  press: 'Pressemitteilung',
};

// =====================================================================
// ERROR HANDLING UTILITIES
// =====================================================================

interface BulkOperationResult {
  success?: number;
  failed?: number;
  errors?: string[];
  [key: string]: unknown;
}

interface ProcessedBulkResult extends BulkOperationResult {
  message: string;
  hasErrors: boolean;
  isComplete: boolean;
}

interface Badge {
  text: string;
  className: string;
  type: string;
}

interface Detail {
  label: string;
  value: string;
}

interface ItemDisplayMetadata {
  badges: Badge[];
  details: Detail[];
  actions: unknown[];
}

interface EditabilityResult {
  canEdit: boolean;
  reason: string | null;
}

interface DeletabilityResult {
  canDelete: boolean;
  reason: string | null;
}

interface ContentItem {
  id?: string;
  title?: string;
  name?: string;
  status?: string;
  file_type?: string;
  file_size?: number;
  type?: string;
  word_count?: number;
  [key: string]: unknown;
}

/**
 * Formats API errors into user-friendly messages
 * @param error - The error to format
 * @param context - Context for the error (e.g., 'deleting documents')
 * @returns Formatted error message
 */
export const formatApiError = (error: Error | string, context = 'operation'): string => {
  if (typeof error === 'string') {
    return error;
  }

  const message = error?.message || 'Ein unbekannter Fehler ist aufgetreten.';
  return `Fehler beim ${context}: ${message}`;
};

/**
 * Handles bulk operation results and provides user feedback
 * @param result - API response result
 * @param operation - Type of operation (e.g., 'delete', 'update')
 * @param itemType - Type of items being processed (e.g., 'documents', 'texts')
 * @returns Processed result with user-friendly messages
 */
export const handleBulkOperationResult = (
  result: BulkOperationResult,
  operation: string,
  itemType: string
): ProcessedBulkResult => {
  const { success = 0, failed = 0 } = result;

  let message = '';
  if (success > 0 && failed === 0) {
    message = `${success} ${itemType} erfolgreich ${operation === 'delete' ? 'gelöscht' : 'verarbeitet'}.`;
  } else if (success > 0 && failed > 0) {
    message = `${success} ${itemType} erfolgreich ${operation === 'delete' ? 'gelöscht' : 'verarbeitet'}, ${failed} fehlgeschlagen.`;
  } else if (failed > 0) {
    message = `Fehler beim ${operation === 'delete' ? 'Löschen' : 'Verarbeiten'} von ${failed} ${itemType}.`;
  }

  return {
    ...result,
    message,
    hasErrors: failed > 0,
    isComplete: success > 0,
  };
};

// =====================================================================
// BULK OPERATIONS
// =====================================================================

/**
 * Bulk delete documents
 * @param documentIds - Array of document IDs to delete
 * @returns Result of bulk delete operation
 */
export const bulkDeleteDocuments = async (documentIds: string[]): Promise<ProcessedBulkResult> => {
  try {
    console.log('[documentAndTextUtils] Bulk deleting documents:', documentIds);

    const response = await apiClient.delete('/documents/bulk', {
      data: { ids: documentIds },
    });

    const result = response.data;
    console.log('[documentAndTextUtils] Bulk delete documents result:', result);

    return handleBulkOperationResult(result, 'delete', 'Dokumente');
  } catch (error) {
    console.error('[documentAndTextUtils] Error in bulk delete documents:', error);
    throw new Error(formatApiError(error as Error, 'Bulk-Löschen der Dokumente'));
  }
};

/**
 * Bulk delete texts
 * @param textIds - Array of text IDs to delete
 * @returns Result of bulk delete operation
 */
export const bulkDeleteTexts = async (textIds: string[]): Promise<ProcessedBulkResult> => {
  try {
    console.log('[documentAndTextUtils] Bulk deleting texts:', textIds);

    const response = await apiClient.delete('/saved-texts/bulk', {
      data: { ids: textIds },
    });

    const result = response.data;
    console.log('[documentAndTextUtils] Bulk delete texts result:', result);

    return handleBulkOperationResult(result, 'delete', 'Texte');
  } catch (error) {
    console.error('[documentAndTextUtils] Error in bulk delete texts:', error);
    throw new Error(formatApiError(error as Error, 'Bulk-Löschen der Texte'));
  }
};

/**
 * Bulk delete QA collections
 * @param qaIds - Array of QA collection IDs to delete
 * @returns Result of bulk delete operation
 */
export const bulkDeleteQA = async (qaIds: string[]): Promise<ProcessedBulkResult> => {
  try {
    console.log('[documentAndTextUtils] Bulk deleting QA collections:', qaIds);

    const response = await apiClient.delete('/qa-collections/bulk', {
      data: { ids: qaIds },
    });

    const result = response.data;
    console.log('[documentAndTextUtils] Bulk delete QA result:', result);

    return handleBulkOperationResult(result, 'delete', 'Notebooks');
  } catch (error) {
    console.error('[documentAndTextUtils] Error in bulk delete QA:', error);
    throw new Error(formatApiError(error as Error, 'Bulk-Löschen der Notebooks'));
  }
};

// =====================================================================
// BUSINESS LOGIC HELPERS
// =====================================================================

/**
 * Creates a share action function for a specific content type
 * @param contentType - Type of content being shared
 * @param shareHandler - Function to handle the share action
 * @returns Share action function
 */
export const createShareAction =
  (contentType: string, shareHandler: (contentType: string, id: string, title: string) => void) =>
  (item: ContentItem) => {
    return shareHandler(contentType, item.id || '', item.title || item.name || '');
  };

/**
 * Validates if an item can be edited based on its properties
 * @param item - The item to validate
 * @param itemType - Type of the item ('text', 'document', 'template')
 * @returns Validation result with canEdit and reason
 */
export const validateItemEditability = (item: ContentItem, itemType: string): EditabilityResult => {
  if (itemType === 'template' && item.id && item.id.startsWith('canva_')) {
    return {
      canEdit: false,
      reason: 'Canva Design Titel können nur in Canva selbst bearbeitet werden.',
    };
  }

  if (itemType === 'document' && item.status === 'processing') {
    return {
      canEdit: false,
      reason: 'Dokument wird noch verarbeitet und kann nicht bearbeitet werden.',
    };
  }

  return {
    canEdit: true,
    reason: null,
  };
};

/**
 * Validates if an item can be deleted based on its properties
 * @param item - The item to validate
 * @param itemType - Type of the item ('text', 'document', 'template')
 * @returns Validation result with canDelete and reason
 */
export const validateItemDeletability = (
  item: ContentItem,
  itemType: string
): DeletabilityResult => {
  if (itemType === 'template' && item.id && item.id.startsWith('canva_')) {
    return {
      canDelete: false,
      reason: 'Canva Designs können nur in Canva selbst gelöscht werden.',
    };
  }

  return {
    canDelete: true,
    reason: null,
  };
};

/**
 * Gets display metadata for an item based on its type and properties
 * @param item - The item to get metadata for
 * @param itemType - Type of the item
 * @returns Metadata object with display information
 */
export const getItemDisplayMetadata = (
  item: ContentItem,
  itemType: string
): ItemDisplayMetadata => {
  const metadata: ItemDisplayMetadata = {
    badges: [],
    details: [],
    actions: [],
  };

  // Add status badges
  if (item.status) {
    const statusConfig: Record<string, { text: string; className: string }> = {
      processing: { text: 'Verarbeitung...', className: 'status-processing' },
      completed: { text: 'Abgeschlossen', className: 'status-completed' },
      failed: { text: 'Fehler', className: 'status-error' },
      pending: { text: 'Wartend', className: 'status-pending' },
    };

    const config = statusConfig[item.status];
    if (config) {
      metadata.badges.push({
        text: config.text,
        className: config.className,
        type: 'status',
      });
    }
  }

  // Add type-specific metadata
  if (itemType === 'document') {
    if (item.file_type) {
      const typeLabel = DOCUMENT_TYPES[item.file_type] || item.file_type;
      metadata.details.push({
        label: 'Typ',
        value: typeLabel,
      });
    }

    if (item.file_size) {
      metadata.details.push({
        label: 'Größe',
        value: formatFileSize(item.file_size),
      });
    }
  }

  if (itemType === 'text') {
    if (item.type) {
      const typeLabel = TEXT_DOCUMENT_TYPES[item.type] || item.type;
      metadata.details.push({
        label: 'Typ',
        value: typeLabel,
      });
    }

    if (item.word_count) {
      metadata.details.push({
        label: 'Wörter',
        value: item.word_count.toLocaleString(),
      });
    }
  }

  return metadata;
};

/**
 * Formats file size in bytes to human-readable format
 * @param bytes - File size in bytes
 * @returns Formatted file size
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Formats a date for display in the UI
 * @param date - Date to format
 * @returns Formatted date string
 */
export const formatDisplayDate = (date: string | Date | null | undefined): string => {
  if (!date) return '';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) return '';

  return new Intl.DateTimeFormat('de-DE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dateObj);
};

// =====================================================================
// SEARCH AND FILTER UTILITIES
// =====================================================================

/**
 * Filters items based on search query and filters
 * @param items - Items to filter
 * @param searchQuery - Search query string
 * @param searchFields - Fields to search in
 * @param filters - Additional filters to apply
 * @returns Filtered items
 */
export const filterItems = <T extends Record<string, unknown>>(
  items: T[],
  searchQuery = '',
  searchFields: string[] = ['title', 'name'],
  filters: Record<string, unknown> = {}
): T[] => {
  if (!items || !Array.isArray(items)) return [];

  let filteredItems = [...items];

  // Apply search query
  if (searchQuery && searchQuery.trim()) {
    const query = searchQuery.toLowerCase().trim();
    filteredItems = filteredItems.filter((item) => {
      return searchFields.some((field) => {
        const value = item[field];
        return value && typeof value === 'string' && value.toLowerCase().includes(query);
      });
    });
  }

  // Apply additional filters
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      filteredItems = filteredItems.filter((item) => item[key] === value);
    }
  });

  return filteredItems;
};

/**
 * Sorts items based on sort configuration
 * @param items - Items to sort
 * @param sortBy - Field to sort by
 * @param sortOrder - Sort order ('asc' or 'desc')
 * @returns Sorted items
 */
export const sortItems = <T extends Record<string, unknown>>(
  items: T[],
  sortBy = 'created_at',
  sortOrder: 'asc' | 'desc' = 'desc'
): T[] => {
  if (!items || !Array.isArray(items)) return [];

  return [...items].sort((a, b) => {
    let aValue: unknown = a[sortBy];
    let bValue: unknown = b[sortBy];

    // Handle date fields
    if (sortBy.includes('_at') || sortBy === 'date') {
      aValue = new Date(aValue as string);
      bValue = new Date(bValue as string);
    }

    // Handle string fields
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      aValue = aValue.toLowerCase();
      bValue = bValue.toLowerCase();
    }

    // Handle null/undefined values
    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return sortOrder === 'asc' ? -1 : 1;
    if (bValue == null) return sortOrder === 'asc' ? 1 : -1;

    // Compare values
    if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });
};
