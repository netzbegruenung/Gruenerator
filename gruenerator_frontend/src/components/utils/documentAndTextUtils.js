/**
 * Document and Text Management Utilities
 * 
 * This file contains business logic, constants, and utility functions
 * for document and text management operations, extracted from ContentManagementTab
 * to improve code organization and reusability.
 */

const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// =====================================================================
// CONSTANTS AND TYPE DEFINITIONS
// =====================================================================

export const DOCUMENT_TYPES = {
    'pdf': 'PDF-Dokument',
    'document': 'Dokument',
    'text': 'Text',
    'upload': 'Hochgeladene Datei'
};

export const TEXT_DOCUMENT_TYPES = {
    'text': 'Allgemeiner Text',
    'antrag': 'Antrag',
    'social': 'Social Media',
    'universal': 'Universal',
    'press': 'Pressemitteilung',
    'gruene_jugend': 'Gruene Jugend'
};

// =====================================================================
// ERROR HANDLING UTILITIES
// =====================================================================

/**
 * Formats API errors into user-friendly messages
 * @param {Error|string} error - The error to format
 * @param {string} context - Context for the error (e.g., 'deleting documents')
 * @returns {string} Formatted error message
 */
export const formatApiError = (error, context = 'operation') => {
    if (typeof error === 'string') {
        return error;
    }
    
    const message = error?.message || 'Ein unbekannter Fehler ist aufgetreten.';
    return `Fehler beim ${context}: ${message}`;
};

/**
 * Handles bulk operation results and provides user feedback
 * @param {Object} result - API response result
 * @param {string} operation - Type of operation (e.g., 'delete', 'update')
 * @param {string} itemType - Type of items being processed (e.g., 'documents', 'texts')
 * @returns {Object} Processed result with user-friendly messages
 */
export const handleBulkOperationResult = (result, operation, itemType) => {
    const { success = 0, failed = 0, errors = [] } = result;
    
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
        isComplete: success > 0
    };
};

// =====================================================================
// BULK OPERATIONS
// =====================================================================

/**
 * Bulk delete documents
 * @param {string[]} documentIds - Array of document IDs to delete
 * @returns {Promise<Object>} Result of bulk delete operation
 */
export const bulkDeleteDocuments = async (documentIds) => {
    try {
        console.log('[documentAndTextUtils] Bulk deleting documents:', documentIds);
        
        const response = await fetch(`${AUTH_BASE_URL}/documents/bulk`, {
            method: 'DELETE',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ids: documentIds })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Bulk delete failed');
        }

        const result = await response.json();
        console.log('[documentAndTextUtils] Bulk delete documents result:', result);
        
        return handleBulkOperationResult(result, 'delete', 'Dokumente');
    } catch (error) {
        console.error('[documentAndTextUtils] Error in bulk delete documents:', error);
        throw new Error(formatApiError(error, 'Bulk-Löschen der Dokumente'));
    }
};

/**
 * Bulk delete texts
 * @param {string[]} textIds - Array of text IDs to delete
 * @returns {Promise<Object>} Result of bulk delete operation
 */
export const bulkDeleteTexts = async (textIds) => {
    try {
        console.log('[documentAndTextUtils] Bulk deleting texts:', textIds);
        
        const response = await fetch(`${AUTH_BASE_URL}/saved-texts/bulk`, {
            method: 'DELETE',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ids: textIds })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Bulk delete failed');
        }

        const result = await response.json();
        console.log('[documentAndTextUtils] Bulk delete texts result:', result);
        
        return handleBulkOperationResult(result, 'delete', 'Texte');
    } catch (error) {
        console.error('[documentAndTextUtils] Error in bulk delete texts:', error);
        throw new Error(formatApiError(error, 'Bulk-Löschen der Texte'));
    }
};

/**
 * Bulk delete QA collections
 * @param {string[]} qaIds - Array of QA collection IDs to delete
 * @returns {Promise<Object>} Result of bulk delete operation
 */
export const bulkDeleteQA = async (qaIds) => {
    try {
        console.log('[documentAndTextUtils] Bulk deleting QA collections:', qaIds);
        
        const response = await fetch(`${AUTH_BASE_URL}/qa-collections/bulk`, {
            method: 'DELETE',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ids: qaIds })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Bulk delete failed');
        }

        const result = await response.json();
        console.log('[documentAndTextUtils] Bulk delete QA result:', result);
        
        return handleBulkOperationResult(result, 'delete', 'Q&A-Sammlungen');
    } catch (error) {
        console.error('[documentAndTextUtils] Error in bulk delete QA:', error);
        throw new Error(formatApiError(error, 'Bulk-Löschen der Q&A-Sammlungen'));
    }
};

// =====================================================================
// BUSINESS LOGIC HELPERS
// =====================================================================

/**
 * Creates a share action function for a specific content type
 * @param {string} contentType - Type of content being shared
 * @param {Function} shareHandler - Function to handle the share action
 * @returns {Function} Share action function
 */
export const createShareAction = (contentType, shareHandler) => (item) => {
    return shareHandler(contentType, item.id, item.title || item.name);
};

/**
 * Validates if an item can be edited based on its properties
 * @param {Object} item - The item to validate
 * @param {string} itemType - Type of the item ('text', 'document', 'template')
 * @returns {Object} Validation result with canEdit and reason
 */
export const validateItemEditability = (item, itemType) => {
    if (itemType === 'template' && item.id && item.id.startsWith('canva_')) {
        return {
            canEdit: false,
            reason: 'Canva Design Titel können nur in Canva selbst bearbeitet werden.'
        };
    }
    
    if (itemType === 'document' && item.status === 'processing') {
        return {
            canEdit: false,
            reason: 'Dokument wird noch verarbeitet und kann nicht bearbeitet werden.'
        };
    }
    
    return {
        canEdit: true,
        reason: null
    };
};

/**
 * Validates if an item can be deleted based on its properties
 * @param {Object} item - The item to validate
 * @param {string} itemType - Type of the item ('text', 'document', 'template')
 * @returns {Object} Validation result with canDelete and reason
 */
export const validateItemDeletability = (item, itemType) => {
    if (itemType === 'template' && item.id && item.id.startsWith('canva_')) {
        return {
            canDelete: false,
            reason: 'Canva Designs können nur in Canva selbst gelöscht werden.'
        };
    }
    
    return {
        canDelete: true,
        reason: null
    };
};

/**
 * Gets display metadata for an item based on its type and properties
 * @param {Object} item - The item to get metadata for
 * @param {string} itemType - Type of the item
 * @returns {Object} Metadata object with display information
 */
export const getItemDisplayMetadata = (item, itemType) => {
    const metadata = {
        badges: [],
        details: [],
        actions: []
    };
    
    // Add status badges
    if (item.status) {
        const statusConfig = {
            'processing': { text: 'Verarbeitung...', className: 'status-processing' },
            'completed': { text: 'Abgeschlossen', className: 'status-completed' },
            'failed': { text: 'Fehler', className: 'status-error' },
            'pending': { text: 'Wartend', className: 'status-pending' }
        };
        
        const config = statusConfig[item.status];
        if (config) {
            metadata.badges.push({
                text: config.text,
                className: config.className,
                type: 'status'
            });
        }
    }
    
    // Add type-specific metadata
    if (itemType === 'document') {
        if (item.file_type) {
            const typeLabel = DOCUMENT_TYPES[item.file_type] || item.file_type;
            metadata.details.push({
                label: 'Typ',
                value: typeLabel
            });
        }
        
        if (item.file_size) {
            metadata.details.push({
                label: 'Größe',
                value: formatFileSize(item.file_size)
            });
        }
    }
    
    if (itemType === 'text') {
        if (item.type) {
            const typeLabel = TEXT_DOCUMENT_TYPES[item.type] || item.type;
            metadata.details.push({
                label: 'Typ',
                value: typeLabel
            });
        }
        
        if (item.word_count) {
            metadata.details.push({
                label: 'Wörter',
                value: item.word_count.toLocaleString()
            });
        }
    }
    
    return metadata;
};

/**
 * Formats file size in bytes to human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
export const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Formats a date for display in the UI
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date string
 */
export const formatDisplayDate = (date) => {
    if (!date) return '';
    
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    if (isNaN(dateObj.getTime())) return '';
    
    return new Intl.DateTimeFormat('de-DE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(dateObj);
};

// =====================================================================
// SEARCH AND FILTER UTILITIES
// =====================================================================

/**
 * Filters items based on search query and filters
 * @param {Array} items - Items to filter
 * @param {string} searchQuery - Search query string
 * @param {Array} searchFields - Fields to search in
 * @param {Object} filters - Additional filters to apply
 * @returns {Array} Filtered items
 */
export const filterItems = (items, searchQuery = '', searchFields = ['title', 'name'], filters = {}) => {
    if (!items || !Array.isArray(items)) return [];
    
    let filteredItems = [...items];
    
    // Apply search query
    if (searchQuery && searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        filteredItems = filteredItems.filter(item => {
            return searchFields.some(field => {
                const value = item[field];
                return value && typeof value === 'string' && value.toLowerCase().includes(query);
            });
        });
    }
    
    // Apply additional filters
    Object.entries(filters).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
            filteredItems = filteredItems.filter(item => item[key] === value);
        }
    });
    
    return filteredItems;
};

/**
 * Sorts items based on sort configuration
 * @param {Array} items - Items to sort
 * @param {string} sortBy - Field to sort by
 * @param {string} sortOrder - Sort order ('asc' or 'desc')
 * @returns {Array} Sorted items
 */
export const sortItems = (items, sortBy = 'created_at', sortOrder = 'desc') => {
    if (!items || !Array.isArray(items)) return [];
    
    return [...items].sort((a, b) => {
        let aValue = a[sortBy];
        let bValue = b[sortBy];
        
        // Handle date fields
        if (sortBy.includes('_at') || sortBy === 'date') {
            aValue = new Date(aValue);
            bValue = new Date(bValue);
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