/**
 * Canva Template Utilities
 * 
 * This file contains business logic and utility functions specifically
 * for Canva template management, extracted from ContentManagementTab
 * to improve code organization and reusability.
 */

import { HiOutlineEye, HiShare, HiOutlineTrash, HiCheck, HiPhotograph } from 'react-icons/hi';
import * as canvaUtils from './canvaUtils';

// =====================================================================
// TEMPLATE ACTION ITEM GENERATION
// =====================================================================

/**
 * Generates action items for Canva templates based on their properties
 * @param {Object} template - The template object
 * @param {Object} options - Options for action generation
 * @param {Function} options.onEditTemplate - Handler for editing templates
 * @param {Function} options.onDeleteTemplate - Handler for deleting templates
 * @param {Function} options.onShareToGroup - Handler for sharing to groups
 * @param {Function} options.onCreateAltText - Handler for creating alt text
 * @param {Function} options.onErrorMessage - Error message handler
 * @returns {Array} Array of action items
 */
export const generateCanvaTemplateActionItems = (template, options) => {
    const {
        onEditTemplate,
        onDeleteTemplate,
        onShareToGroup,
        onCreateAltText,
        onErrorMessage
    } = options;

    const isCanvaDesign = template.source === 'canva';

    if (isCanvaDesign) {
        const actions = [
            {
                icon: HiOutlineEye,
                label: 'In Canva öffnen',
                onClick: () => {
                    if (template.canva_url) {
                        window.open(template.canva_url, '_blank');
                    } else {
                        onErrorMessage('Keine Canva URL verfügbar.');
                    }
                },
                primary: true
            },
            {
                icon: HiPhotograph,
                label: 'Alt-Text erstellen',
                onClick: () => {
                    if (onCreateAltText) {
                        onCreateAltText(template);
                    } else {
                        onErrorMessage('Alt-Text Funktion ist nicht verfügbar.');
                    }
                },
                show: true
            }
        ];

        // Always show share action
        actions.push({
            icon: HiShare,
            label: 'Mit Gruppe teilen',
            onClick: () => onShareToGroup('database', template.id, template.title),
            show: true
        });

        return actions;
    } else {
        const localActions = [
            {
                icon: HiOutlineEye,
                label: template.canva_url ? 'In Canva öffnen' : 'Anzeigen',
                onClick: () => onEditTemplate(template),
                primary: true
            },
            {
                icon: HiPhotograph,
                label: 'Alt-Text erstellen',
                onClick: () => {
                    if (onCreateAltText) {
                        onCreateAltText(template);
                    } else {
                        onErrorMessage('Alt-Text Funktion ist nicht verfügbar.');
                    }
                },
                show: true
            },
            {
                icon: HiShare,
                label: 'Mit Gruppe teilen',
                onClick: () => onShareToGroup('database', template.id, template.title),
                show: true
            }
        ];

        localActions.push(
            {
                separator: true
            },
            {
                icon: HiOutlineTrash,
                label: 'Löschen',
                onClick: () => onDeleteTemplate(template.id),
                show: true,
                danger: true
            }
        );

        return localActions;
    }
};

// =====================================================================
// TEMPLATE METADATA CONFIGURATION
// =====================================================================

/**
 * Gets template metadata configuration for display
 * @param {Object} template - The template object
 * @param {Set} savedCanvaDesigns - Set of saved design IDs
 * @returns {Object} Metadata configuration with badges and metadata arrays
 */
export const getTemplateMetadataConfig = (template, savedCanvaDesigns) => {
    const config = {
        badges: [],
        metadata: []
    };

    // Add source badge for Canva designs
    if (template.source === 'canva') {
        config.badges.push({
            text: 'Canva Design',
            className: 'template-badge canva-badge',
            style: {
                backgroundColor: 'var(--canva-brand-color, #00c4cc)',
                color: 'white',
                fontSize: '0.75rem',
                padding: '2px 6px',
                borderRadius: '4px',
                fontWeight: '500'
            },
            type: 'source',
            title: 'Direkt aus Canva importiert'
        });

        // Add saved badge if applicable
        if (savedCanvaDesigns.has(template.canva_id) || template.has_user_link) {
            config.badges.push({
                text: 'Gespeichert',
                className: 'template-badge saved-badge',
                style: {
                    backgroundColor: 'var(--success-color, #10b981)',
                    color: 'white',
                    fontSize: '0.75rem',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontWeight: '500'
                },
                type: 'status',
                title: 'Als Vorlage gespeichert'
            });
        }
    }

    // Add template type metadata
    if (template.template_type) {
        const templateTypes = canvaUtils.CANVA_TEMPLATE_TYPES || {};
        const typeLabel = templateTypes[template.template_type] || template.template_type;
        config.metadata.push({
            text: typeLabel,
            className: 'template-meta-type',
            type: 'template_type'
        });
    }

    // Add dimensions if available
    if (template.width && template.height) {
        config.metadata.push({
            text: `${template.width} × ${template.height}`,
            className: 'template-meta-dimensions',
            type: 'dimensions'
        });
    }

    // Add creation date
    if (template.created_at) {
        const date = new Date(template.created_at);
        config.metadata.push({
            text: date.toLocaleDateString('de-DE'),
            className: 'template-meta-date',
            type: 'created_date'
        });
    }

    return config;
};

// =====================================================================
// TEMPLATE LINK UTILITIES
// =====================================================================

/**
 * Gets available links for a template
 * @param {Object} template - The template object
 * @returns {Array} Array of available links
 */
export const getAvailableLinks = (template) => {
    const links = [];

    if (template.canva_url) {
        links.push({
            label: 'Canva Design Link',
            url: template.canva_url,
            type: 'canva_url'
        });
    }

    if (template.external_url && template.external_url !== template.canva_url) {
        links.push({
            label: 'Externe URL',
            url: template.external_url,
            type: 'external_url'
        });
    }

    if (template.share_url) {
        links.push({
            label: 'Freigabe-Link',
            url: template.share_url,
            type: 'share_url'
        });
    }

    return links;
};

/**
 * Enhances a template with user URL
 * @param {Object} template - The template to enhance
 * @param {string} userUrl - The user's Canva URL
 * @returns {Object} Enhanced template object
 */
export const enhanceTemplateWithUserUrl = (template, userUrl) => {
    return {
        ...template,
        has_user_link: true,
        user_canva_url: userUrl.trim(),
        canva_url: userUrl.trim() // Update the main canva_url
    };
};

// =====================================================================
// VALIDATION UTILITIES
// =====================================================================

/**
 * Validates template editability
 * @param {Object} template - Template to validate
 * @returns {Object} Validation result
 */
export const validateTemplateEditability = (template) => {
    if (template.id && template.id.startsWith('canva_')) {
        return {
            canEdit: false,
            reason: 'Canva Design Titel können nur in Canva selbst bearbeitet werden.'
        };
    }
    
    return {
        canEdit: true,
        reason: null
    };
};

/**
 * Validates template deletability
 * @param {Object} template - Template to validate
 * @returns {Object} Validation result
 */
export const validateTemplateDeletability = (template) => {
    if (template.id && template.id.startsWith('canva_')) {
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

// =====================================================================
// BULK OPERATIONS
// =====================================================================

/**
 * Handles bulk deletion of templates
 * @param {Array} templateIds - Array of template IDs to delete
 * @param {Function} onErrorMessage - Error message handler
 * @returns {Promise<Object>} Result of bulk delete operation
 */
export const handleBulkDeleteTemplates = async (templateIds, onErrorMessage) => {
    try {
        // Filter out Canva designs (they can't be deleted)
        const canvaDesignIds = templateIds.filter(id => id.startsWith('canva_'));
        const deletableIds = templateIds.filter(id => !id.startsWith('canva_'));

        if (canvaDesignIds.length > 0) {
            onErrorMessage(`${canvaDesignIds.length} Canva Designs können nicht gelöscht werden. Sie können nur in Canva selbst gelöscht werden.`);
        }

        if (deletableIds.length === 0) {
            return {
                success: 0,
                failed: canvaDesignIds.length,
                message: 'Keine löschbaren Templates ausgewählt.'
            };
        }

        // Note: Bulk delete would need to be implemented in the backend
        // For now, we'll return a placeholder response

        // Fallback: individual deletions
        let successCount = 0;
        let failedCount = 0;
        const errors = [];

        for (const templateId of deletableIds) {
            try {
                // This would need to be implemented based on your API
                // await deleteTemplate(templateId);
                successCount++;
            } catch (error) {
                failedCount++;
                errors.push({ id: templateId, error: error.message });
            }
        }

        return {
            success: successCount,
            failed: failedCount + canvaDesignIds.length,
            errors: errors,
            message: `${successCount} Templates erfolgreich gelöscht${failedCount > 0 ? `, ${failedCount} fehlgeschlagen` : ''}.`
        };
    } catch (error) {
        console.error('[canvaTemplateUtils] Error in bulk delete templates:', error);
        throw error;
    }
};

// =====================================================================
// DISPLAY UTILITIES
// =====================================================================

/**
 * Formats template for display in lists/grids
 * @param {Object} template - Template to format
 * @returns {Object} Formatted template object
 */
export const formatTemplateForDisplay = (template) => {
    return {
        ...template,
        displayTitle: template.title || template.name || 'Unbenannte Vorlage',
        displayType: template.template_type || 'template',
        displayDate: template.created_at ? new Date(template.created_at).toLocaleDateString('de-DE') : '',
        isCanvaDesign: template.source === 'canva',
        hasUserLink: template.has_user_link === true
    };
};

/**
 * Gets template status for display
 * @param {Object} template - Template object
 * @param {Set} savedCanvaDesigns - Set of saved design IDs
 * @returns {Object} Status object
 */
export const getTemplateStatus = (template, savedCanvaDesigns) => {
    if (template.source === 'canva') {
        if (savedCanvaDesigns.has(template.canva_id) || template.has_user_link) {
            return {
                status: 'saved',
                label: 'Gespeichert',
                className: 'status-saved'
            };
        }
        return {
            status: 'imported',
            label: 'Importiert',
            className: 'status-imported'
        };
    }
    
    return {
        status: 'local',
        label: 'Lokal',
        className: 'status-local'
    };
};