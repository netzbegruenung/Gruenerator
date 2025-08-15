/**
 * Canva Utilities Module
 * 
 * Centralized business logic for Canva integration, template management,
 * and related UI operations. Extracted from CanvaTab for better maintainability
 * and reusability across components.
 * 
 * @module canvaUtils
 */

import apiClient from './apiClient';
import { templateService } from './templateService';

// ============================================================================
// API FUNCTIONS - Canva connection, authentication, and design fetching
// ============================================================================

/**
 * Check the current Canva connection status for the authenticated user
 * @param {boolean} isAuthenticated - Whether user is authenticated
 * @returns {Promise<{connected: boolean, canva_user: object|null}>}
 */
export const checkCanvaConnectionStatus = async (isAuthenticated) => {
    if (!isAuthenticated) {
        return { connected: false, canva_user: null };
    }
    
    try {
        const response = await apiClient.get('/canva/auth/status');
        
        if (response.data.success) {
            return {
                connected: response.data.connected,
                canva_user: response.data.canva_user
            };
        } else {
            return { connected: false, canva_user: null };
        }
    } catch (error) {
        console.error('[CanvaUtils] Error checking Canva connection:', error);
        return { connected: false, canva_user: null };
    }
};

/**
 * Initiate Canva OAuth login flow
 * @param {Function} onError - Error callback function
 * @returns {Promise<void>}
 */
export const initiateCanvaLogin = async (onError) => {
    try {
        const response = await apiClient.get('/canva/auth/authorize');
        
        if (response.data.success && response.data.authUrl) {
            window.location.href = response.data.authUrl;
        } else {
            throw new Error(response.data.error || 'Failed to get authorization URL');
        }
    } catch (error) {
        console.error('[CanvaUtils] Error initiating Canva login:', error);
        const errorMessage = 'Fehler beim Verbinden mit Canva: ' + (error.message || 'Bitte versuche es später erneut.');
        onError?.(errorMessage);
        throw error;
    }
};

/**
 * Transform Canva API designs to internal template structure
 * @param {Array} designs - Raw designs from Canva API
 * @returns {Array} Transformed design objects
 */
export const transformCanvaDesigns = (designs) => {
    return designs.map(design => ({
        id: `canva_${design.id}`,
        title: design.title || 'Untitled Design',
        type: 'canva_design',
        canva_id: design.id,
        canva_url: design.urls?.edit_url,
        external_url: design.urls?.view_url,
        thumbnail_url: design.thumbnail?.url,
        preview_image_url: design.thumbnail?.url,
        created_at: design.created_at ? new Date(design.created_at * 1000).toISOString() : null,
        updated_at: design.updated_at ? new Date(design.updated_at * 1000).toISOString() : null,
        source: 'canva',
        page_count: design.page_count,
        owner: design.owner
    }));
};

/**
 * Fetch Canva designs with retry logic and error handling
 * @param {boolean} canvaConnected - Whether Canva is connected
 * @param {boolean} isAuthenticated - Whether user is authenticated
 * @param {number} retryCount - Current retry attempt (default: 0)
 * @param {number} maxRetries - Maximum retry attempts (default: 2)
 * @param {Function} onError - Error callback function
 * @returns {Promise<Array>} Array of transformed Canva designs
 */
export const fetchCanvaDesigns = async (
    canvaConnected, 
    isAuthenticated, 
    retryCount = 0, 
    maxRetries = 2,
    onError = null
) => {
    if (!canvaConnected || !isAuthenticated) {
        return [];
    }
    
    try {
        console.log(`[CanvaUtils] Fetching Canva designs... (attempt ${retryCount + 1})`);
        const response = await apiClient.get('/canva/designs', {
            params: {
                limit: 20,
                sort_by: 'modified_descending'
            }
        });
        
        if (response.data.success) {
            const designs = response.data.designs || [];
            console.log(`[CanvaUtils] Fetched ${designs.length} Canva designs`);
            return transformCanvaDesigns(designs);
        } else {
            throw new Error(response.data.error || 'Failed to fetch Canva designs');
        }
    } catch (error) {
        console.error(`[CanvaUtils] Error fetching Canva designs (attempt ${retryCount + 1}):`, error);
        
        const shouldRetry = retryCount < maxRetries && (
            error.response?.status >= 500 ||
            error.code === 'NETWORK_ERROR' ||
            error.name === 'TimeoutError'
        );
        
        if (shouldRetry) {
            console.log(`[CanvaUtils] Retrying Canva designs fetch in ${(retryCount + 1) * 1000}ms...`);
            await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 1000));
            return fetchCanvaDesigns(canvaConnected, isAuthenticated, retryCount + 1, maxRetries, onError);
        }
        
        // Generate user-friendly error message
        let errorMessage = 'Fehler beim Laden der Canva Designs';
        if (error.response?.status === 401) {
            errorMessage = 'Canva-Verbindung abgelaufen. Bitte verbinde dich erneut.';
        } else if (error.response?.status === 403) {
            errorMessage = 'Keine Berechtigung zum Zugriff auf Canva Designs.';
        } else if (error.response?.status >= 500) {
            errorMessage = 'Canva Server-Fehler. Bitte versuche es später erneut.';
        } else if (error.code === 'NETWORK_ERROR' || !navigator.onLine) {
            errorMessage = 'Netzwerkfehler. Bitte überprüfe deine Internetverbindung.';
        }
        
        onError?.(errorMessage);
        throw new Error(errorMessage);
    }
};

// ============================================================================
// TEMPLATE MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Save a Canva design as a local template
 * @param {Object} canvaDesign - The Canva design object
 * @param {Function} onSuccess - Success callback function
 * @param {Function} onError - Error callback function
 * @returns {Promise<Object>} Result of the save operation
 */
export const saveCanvaTemplate = async (canvaDesign, onSuccess = null, onError = null) => {
    if (!canvaDesign.canva_url) {
        const errorMsg = 'Keine Canva URL verfügbar zum Speichern.';
        onError?.(errorMsg);
        throw new Error(errorMsg);
    }

    try {
        console.log(`[CanvaUtils] Saving Canva design: ${canvaDesign.title}`);
        
        const result = await templateService.createUserTemplateFromUrl(
            canvaDesign.canva_url, 
            true
        );
        
        if (result.success) {
            const successMsg = `"${canvaDesign.title}" wurde als lokale Vorlage gespeichert und kann jetzt geteilt werden.`;
            onSuccess?.(successMsg);
            console.log('[CanvaUtils] Canva design saved successfully:', result.data);
            return result;
        } else {
            throw new Error(result.message || 'Failed to save Canva template');
        }
    } catch (error) {
        console.error('[CanvaUtils] Error saving Canva template:', error);
        
        let errorMessage = 'Fehler beim Speichern der Canva Vorlage';
        if (error.message.includes('already exists') || error.message.includes('duplicate')) {
            errorMessage = 'Diese Canva Vorlage wurde bereits gespeichert.';
        } else if (error.message.includes('invalid URL') || error.message.includes('not accessible')) {
            errorMessage = 'Canva Design ist nicht öffentlich zugänglich oder URL ist ungültig.';
        }
        
        onError?.(errorMessage);
        throw new Error(errorMessage);
    }
};

/**
 * Enhance a template with user's Canva URL
 * @param {Object} template - The template to enhance
 * @param {string} canvaUrl - User's Canva URL
 * @returns {Object} Enhanced template object
 */
export const enhanceTemplateWithUserUrl = (template, canvaUrl) => {
    return {
        ...template,
        user_canva_url: canvaUrl,
        has_user_link: true,
        linked_at: new Date().toISOString(),
        server_canva_url: template.canva_url,
        canva_url: canvaUrl
    };
};

/**
 * Create a shareable template from enhanced Canva design
 * @param {Object} template - The enhanced template
 * @param {Function} onSuccess - Success callback
 * @param {Function} onError - Error callback
 * @returns {Promise<Object>} Created template result
 */
export const createShareableTemplate = async (template, onSuccess = null, onError = null) => {
    try {
        console.log('[CanvaUtils] Creating local template for sharing:', template.title);
        
        const templateData = {
            title: template.title,
            description: template.description || `Verknüpft mit Canva Design: ${template.title}`,
            template_type: 'canva',
            canva_url: template.user_canva_url,
            preview_image_url: template.preview_image_url || template.thumbnail_url,
            categories: template.categories || ['canva'],
            tags: [...(template.tags || []), 'enhanced-canva-template'],
            content_data: {
                server_template_id: template.id,
                server_template_source: 'canva',
                linked_via_url: true,
                enhanced_template: true
            },
            metadata: {
                template_type: 'canva',
                source: 'enhanced_canva',
                server_template_id: template.id,
                linked_at: template.linked_at
            }
        };

        const result = await templateService.createUserTemplate(templateData);
        
        if (result.success) {
            console.log('[CanvaUtils] Local template created for sharing:', result.data);
            onSuccess?.(result);
            return result;
        } else {
            throw new Error(result.message || 'Failed to create local template for sharing');
        }
    } catch (error) {
        console.error('[CanvaUtils] Error creating local template for sharing:', error);
        const errorMsg = 'Fehler beim Erstellen der Vorlage für das Teilen: ' + error.message;
        onError?.(errorMsg);
        throw new Error(errorMsg);
    }
};

// ============================================================================
// URL VALIDATION & UTILITIES
// ============================================================================

/**
 * Validate a Canva URL
 * @param {string} url - URL to validate
 * @returns {string} Empty string if valid, error message if invalid
 */
export const validateCanvaUrl = (url) => {
    if (!url.trim()) {
        return 'Bitte geben Sie eine Canva URL ein.';
    }
    
    try {
        const urlObj = new URL(url);
        if (!urlObj.hostname.includes('canva.com')) {
            return 'URL muss von canva.com stammen.';
        }
        if (!urlObj.pathname.includes('/design/')) {
            return 'Bitte verwenden Sie eine gültige Canva Design-URL.';
        }
        return '';
    } catch (error) {
        return 'Ungültiges URL-Format.';
    }
};

/**
 * Get all available links from a template
 * @param {Object} template - Template object
 * @returns {Array} Array of link objects with url, label, and description
 */
export const getAvailableLinks = (template) => {
    const links = [];
    
    if (template.user_canva_url) {
        links.push({ 
            url: template.user_canva_url, 
            label: 'Meine Canva URL',
            description: 'Ihre persönliche Canva Design URL'
        });
    }
    
    if (template.server_canva_url) {
        links.push({ 
            url: template.server_canva_url, 
            label: 'Server Canva URL',
            description: 'Original Server Design URL'
        });
    }
    
    if (template.canva_url && !template.user_canva_url) {
        links.push({ 
            url: template.canva_url, 
            label: 'Canva Edit URL',
            description: 'Canva Design bearbeiten'
        });
    }
    
    if (template.external_url && template.external_url !== template.canva_url) {
        links.push({ 
            url: template.external_url, 
            label: 'Canva Ansicht URL',
            description: 'Canva Design ansehen'
        });
    }
    
    return links;
};

/**
 * Copy URL to clipboard with fallback method
 * @param {string} url - URL to copy
 * @param {string} linkType - Type of link for user feedback
 * @param {Function} onSuccess - Success callback
 * @param {Function} onError - Error callback
 * @param {Function} onClose - Optional close callback
 * @returns {Promise<void>}
 */
export const copyToClipboard = async (url, linkType, onSuccess = null, onError = null, onClose = null) => {
    try {
        await navigator.clipboard.writeText(url);
        const successMsg = `${linkType} wurde in die Zwischenablage kopiert.`;
        onSuccess?.(successMsg);
        onClose?.();
    } catch (error) {
        console.error('[CanvaUtils] Error copying to clipboard:', error);
        try {
            // Fallback method for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = url;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            const successMsg = `${linkType} wurde in die Zwischenablage kopiert.`;
            onSuccess?.(successMsg);
            onClose?.();
        } catch (fallbackError) {
            const errorMsg = 'Fehler beim Kopieren in die Zwischenablage.';
            onError?.(errorMsg);
        }
    }
};

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * Handle bulk deletion of templates with Canva/local separation
 * @param {Array} templateIds - Array of template IDs to delete
 * @param {Function} onError - Error callback function
 * @returns {Promise<Object>} Result of bulk delete operation
 */
export const handleBulkDeleteTemplates = async (templateIds, onError = null) => {
    try {
        const localTemplateIds = templateIds.filter(id => !id.startsWith('canva_'));
        const canvaDesignCount = templateIds.length - localTemplateIds.length;
        
        if (canvaDesignCount > 0) {
            const warningMsg = `${canvaDesignCount} Canva Design(s) können nur in Canva selbst gelöscht werden.`;
            onError?.(warningMsg);
        }
        
        if (localTemplateIds.length === 0) {
            return { deleted: 0, message: 'Keine lokalen Vorlagen zum Löschen ausgewählt.' };
        }
        
        const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
        const response = await fetch(`${AUTH_BASE_URL}/auth/user-templates/bulk`, {
            method: 'DELETE',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ids: localTemplateIds })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Bulk delete failed');
        }

        const result = await response.json();
        console.log('[CanvaUtils] Bulk delete templates result:', result);
        return result;
    } catch (error) {
        console.error('[CanvaUtils] Error in bulk delete templates:', error);
        throw error;
    }
};

// ============================================================================
// OVERVIEW FUNCTIONS - For Canva Overview subtab
// ============================================================================

/**
 * Get comprehensive Canva overview statistics
 * @param {boolean} isAuthenticated - Whether user is authenticated
 * @param {boolean} canvaConnected - Whether Canva is connected
 * @param {Object} canvaUser - Canva user information
 * @returns {Promise<Object>} Overview statistics object
 */
export const getCanvaOverviewStats = async (isAuthenticated, canvaConnected, canvaUser = null) => {
    if (!isAuthenticated || !canvaConnected) {
        return {
            designCount: 0,
            assetCount: 0,
            lastSync: null,
            connectionStatus: 'disconnected',
            canvaUser: null,
            error: null
        };
    }

    try {
        // Fetch both designs and assets count in parallel
        const [designsResponse, assetsResponse] = await Promise.allSettled([
            apiClient.get('/canva/designs', { params: { limit: 1 } }),
            apiClient.get('/canva/assets', { params: { limit: 1 } })
        ]);

        const designCount = designsResponse.status === 'fulfilled' && designsResponse.value.data.success ? 
            (designsResponse.value.data.total_count || 0) : 0;
        
        const assetCount = assetsResponse.status === 'fulfilled' && assetsResponse.value.data.success ? 
            (assetsResponse.value.data.total_count || 0) : 0;

        return {
            designCount,
            assetCount,
            lastSync: new Date().toISOString(),
            connectionStatus: 'connected',
            canvaUser: canvaUser || null,
            error: null
        };
    } catch (error) {
        console.error('[CanvaUtils] Error getting overview stats:', error);
        return {
            designCount: 0,
            assetCount: 0,
            lastSync: null,
            connectionStatus: 'error',
            canvaUser: canvaUser || null,
            error: error.message
        };
    }
};

/**
 * Fetch recent Canva designs for overview display
 * @param {boolean} canvaConnected - Whether Canva is connected
 * @param {boolean} isAuthenticated - Whether user is authenticated
 * @param {number} limit - Number of recent designs to fetch (default: 5)
 * @returns {Promise<Array>} Array of recent designs
 */
export const fetchRecentCanvaDesigns = async (canvaConnected, isAuthenticated, limit = 5) => {
    if (!canvaConnected || !isAuthenticated) {
        return [];
    }

    try {
        console.log(`[CanvaUtils] Fetching ${limit} recent Canva designs for overview`);
        const response = await apiClient.get('/canva/designs', {
            params: {
                limit,
                sort_by: 'modified_descending'
            }
        });

        if (response.data.success) {
            const designs = response.data.designs || [];
            console.log(`[CanvaUtils] Fetched ${designs.length} recent designs for overview`);
            return transformCanvaDesigns(designs);
        } else {
            console.warn('[CanvaUtils] No recent designs found or API returned error');
            return [];
        }
    } catch (error) {
        console.error('[CanvaUtils] Error fetching recent designs:', error);
        return [];
    }
};

/**
 * Generate connection status badge configuration
 * @param {boolean} canvaConnected - Whether Canva is connected
 * @param {Object} canvaUser - Canva user information
 * @param {boolean} canvaLoading - Whether connection is loading
 * @returns {Object} Badge configuration object
 */
export const getCanvaConnectionBadge = (canvaConnected, canvaUser = null, canvaLoading = false) => {
    if (canvaLoading) {
        return {
            type: 'loading',
            text: 'Verbindung wird geprüft...',
            color: 'var(--grey-500)',
            icon: 'loading',
            className: 'canva-connection-badge loading'
        };
    }

    if (canvaConnected && canvaUser) {
        return {
            type: 'connected',
            text: `Verbunden als ${canvaUser.display_name || canvaUser.email || 'Canva User'}`,
            color: 'var(--success-color, #10b981)',
            icon: 'check',
            className: 'canva-connection-badge connected',
            userInfo: {
                name: canvaUser.display_name,
                email: canvaUser.email,
                avatar: canvaUser.avatar_url
            }
        };
    }

    return {
        type: 'disconnected',
        text: 'Nicht verbunden',
        color: 'var(--error-red)',
        icon: 'disconnect',
        className: 'canva-connection-badge disconnected'
    };
};

/**
 * Generate quick action buttons configuration for overview
 * @param {boolean} canvaConnected - Whether Canva is connected
 * @param {Object} handlers - Object containing handler functions
 * @returns {Array} Array of quick action configurations
 */
export const generateOverviewQuickActions = (canvaConnected, handlers = {}) => {
    const baseActions = [
        {
            id: 'connect',
            title: 'Mit Canva verbinden',
            description: 'Verbinde dein Canva-Konto um Designs zu synchronisieren',
            icon: 'HiExternalLink',
            className: 'btn-primary',
            onClick: handlers.onLogin,
            visible: !canvaConnected,
            disabled: handlers.loading
        },
        {
            id: 'sync',
            title: 'Designs synchronisieren',
            description: 'Lade die neuesten Designs von Canva',
            icon: 'HiRefresh',
            className: 'btn-secondary',
            onClick: handlers.onSync,
            visible: canvaConnected,
            disabled: handlers.syncing
        },
        {
            id: 'templates',
            title: 'Vorlagen durchsuchen',
            description: 'Verwalte deine Canva Vorlagen und Designs',
            icon: 'HiTemplate',
            className: 'btn-secondary',
            onClick: () => handlers.onNavigate?.('vorlagen'),
            visible: canvaConnected,
            disabled: false
        },
        {
            id: 'assets',
            title: 'Assets verwalten',
            description: 'Verwalte deine Canva Assets und Medien',
            icon: 'HiPhotograph',
            className: 'btn-secondary',
            onClick: () => handlers.onNavigate?.('assets'),
            visible: canvaConnected,
            disabled: false
        }
    ];

    return baseActions.filter(action => action.visible);
};

/**
 * Get Canva logo configuration following brand guidelines
 * @param {string} size - Size context ('large', 'medium', 'small')
 * @param {string} context - Usage context ('overview', 'header', 'button')
 * @returns {Object} Logo configuration object
 */
export const getCanvaLogoConfig = (size = 'large', context = 'overview') => {
    const baseConfig = {
        alt: 'Canva Logo',
        brandMessage: 'works with Canva',
        poweredByMessage: 'Powered by Canva',
        minimumPadding: '8px',
        maintainAspectRatio: true,
        allowColorChange: false
    };

    switch (size) {
        case 'large':
            return {
                ...baseConfig,
                src: '/images/canva/Canva type logo.svg',
                width: 'auto',
                height: '60px',
                minHeight: '50px',
                className: 'canva-logo-large',
                showPoweredBy: context === 'overview',
                usage: 'For surfaces above 50px - main branding areas'
            };
        
        case 'medium':
            return {
                ...baseConfig,
                src: '/images/canva/Canva type logo.svg',
                width: 'auto',
                height: '40px',
                minHeight: '35px',
                className: 'canva-logo-medium',
                showPoweredBy: false,
                usage: 'For medium surfaces - section headers'
            };
        
        case 'small':
        case 'icon':
            return {
                ...baseConfig,
                src: '/images/canva/Canva Icon logo.svg',
                width: '24px',
                height: '24px',
                minWidth: '20px',
                minHeight: '20px',
                className: 'canva-logo-small',
                showPoweredBy: false,
                usage: 'For surfaces below 50px - UI elements and buttons'
            };
        
        default:
            return baseConfig;
    }
};

/**
 * Format last sync time for display
 * @param {string|Date} timestamp - Timestamp to format
 * @returns {string} Formatted time string
 */
export const formatLastSyncTime = (timestamp) => {
    if (!timestamp) {
        return 'Nie synchronisiert';
    }

    try {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMinutes = Math.floor((now - date) / (1000 * 60));
        
        if (diffMinutes < 1) {
            return 'Gerade synchronisiert';
        } else if (diffMinutes < 60) {
            return `Vor ${diffMinutes} Min. synchronisiert`;
        } else if (diffMinutes < 1440) { // Less than 24 hours
            const hours = Math.floor(diffMinutes / 60);
            return `Vor ${hours} Std. synchronisiert`;
        } else {
            return `Zuletzt: ${date.toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })}`;
        }
    } catch (error) {
        console.error('[CanvaUtils] Error formatting sync time:', error);
        return 'Ungültige Zeit';
    }
};

/**
 * Get overview statistics cards configuration
 * @param {Object} stats - Statistics object from getCanvaOverviewStats
 * @returns {Array} Array of statistics card configurations
 */
export const getOverviewStatsCards = (stats) => {
    return [
        {
            id: 'designs',
            title: 'Designs',
            value: stats.designCount.toLocaleString('de-DE'),
            description: 'Canva Designs verfügbar',
            icon: 'HiTemplate',
            color: 'var(--secondary-600)',
            trend: null // Could be enhanced with historical data
        },
        {
            id: 'assets',
            title: 'Assets',
            value: stats.assetCount.toLocaleString('de-DE'),
            description: 'Medien in Canva Bibliothek',
            icon: 'HiPhotograph',
            color: 'var(--primary-600)',
            trend: null
        },
        {
            id: 'sync',
            title: 'Letzter Sync',
            value: formatLastSyncTime(stats.lastSync),
            description: 'Daten-Synchronisation',
            icon: 'HiRefresh',
            color: 'var(--grey-600)',
            trend: null
        }
    ];
};

/**
 * Disconnect from Canva (utility function)
 * @param {Function} onSuccess - Success callback
 * @param {Function} onError - Error callback
 * @returns {Promise<Object>} Disconnect result
 */
export const disconnectFromCanva = async (onSuccess = null, onError = null) => {
    try {
        console.log('[CanvaUtils] Disconnecting from Canva...');
        const response = await apiClient.post('/canva/auth/disconnect');
        
        if (response.data.success) {
            const successMsg = 'Canva-Verbindung wurde erfolgreich getrennt.';
            onSuccess?.(successMsg);
            console.log('[CanvaUtils] Successfully disconnected from Canva');
            return response.data;
        } else {
            throw new Error(response.data.error || 'Failed to disconnect from Canva');
        }
    } catch (error) {
        console.error('[CanvaUtils] Error disconnecting from Canva:', error);
        const errorMsg = 'Fehler beim Trennen der Canva-Verbindung: ' + error.message;
        onError?.(errorMsg);
        throw new Error(errorMsg);
    }
};

// ============================================================================
// UI HELPERS & ACTION GENERATORS
// ============================================================================

/**
 * Get template metadata configuration for rendering
 * @param {Object} template - Template object
 * @param {Set} savedCanvaDesigns - Set of saved Canva design IDs
 * @returns {Object} Metadata configuration object
 */
export const getTemplateMetadataConfig = (template, savedCanvaDesigns) => {
    const isCanvaDesign = template.source === 'canva';
    const isAlreadySaved = savedCanvaDesigns.has(template.canva_id);
    const hasUserLink = template.has_user_link === true;
    
    return {
        isCanvaDesign,
        isAlreadySaved,
        hasUserLink,
        badges: [
            {
                type: 'source',
                text: isCanvaDesign ? 'Canva' : 'Lokal',
                className: `template-source-badge ${isCanvaDesign ? 'canva-badge' : 'local-badge'}`,
                style: {
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    textTransform: 'uppercase',
                    ...(isCanvaDesign ? {
                        backgroundColor: '#8b5dff',
                        color: 'white'
                    } : {
                        backgroundColor: 'var(--klee)',
                        color: 'var(--background-color)'
                    })
                }
            },
            ...(isCanvaDesign && isAlreadySaved ? [{
                type: 'saved',
                text: 'Gespeichert',
                className: 'template-saved-badge',
                title: 'Als lokale Vorlage gespeichert',
                style: {
                    padding: '2px 6px',
                    borderRadius: '10px',
                    fontSize: '0.7rem',
                    fontWeight: '500',
                    backgroundColor: 'var(--success-color, #10b981)',
                    color: 'white',
                    textTransform: 'uppercase'
                }
            }] : []),
            ...(isCanvaDesign && hasUserLink && !isAlreadySaved ? [{
                type: 'linked',
                text: 'Verknüpft',
                className: 'template-linked-badge',
                title: 'Mit eigener Canva URL verknüpft',
                style: {
                    padding: '2px 6px',
                    borderRadius: '10px',
                    fontSize: '0.7rem',
                    fontWeight: '500',
                    backgroundColor: 'var(--himmel, #0ea5e9)',
                    color: 'white',
                    textTransform: 'uppercase'
                }
            }] : [])
        ],
        metadata: [
            ...(template.type ? [{ type: 'type', text: template.type, className: 'document-type' }] : []),
            ...(template.page_count ? [{
                type: 'pages',
                text: `${template.page_count} ${template.page_count === 1 ? 'Seite' : 'Seiten'}`,
                className: 'document-meta'
            }] : []),
            ...(template.updated_at ? [{
                type: 'updated',
                text: `Bearbeitet: ${new Date(template.updated_at).toLocaleDateString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                })}`,
                className: 'document-meta'
            }] : [])
        ]
    };
};

// ============================================================================
// CANVA ASSETS API FUNCTIONS
// ============================================================================

/**
 * Fetch user's Canva assets with retry logic and error handling
 * @param {boolean} canvaConnected - Whether Canva is connected
 * @param {boolean} isAuthenticated - Whether user is authenticated
 * @param {number} retryCount - Current retry attempt (default: 0)
 * @param {number} maxRetries - Maximum retry attempts (default: 2)
 * @param {Function} onError - Error callback function
 * @returns {Promise<Array>} Array of Canva assets
 */
export const fetchCanvaAssets = async (
    canvaConnected, 
    isAuthenticated, 
    retryCount = 0, 
    maxRetries = 2,
    onError = null
) => {
    if (!canvaConnected || !isAuthenticated) {
        return [];
    }
    
    try {
        console.log(`[CanvaUtils] Fetching Canva assets... (attempt ${retryCount + 1})`);
        const response = await apiClient.get('/canva/assets', {
            params: {
                limit: 50,
                sort_by: 'created_descending'
            }
        });
        
        if (response.data.success) {
            const assets = response.data.assets || [];
            console.log(`[CanvaUtils] Fetched ${assets.length} Canva assets`);
            return transformCanvaAssets(assets);
        } else {
            throw new Error(response.data.error || 'Failed to fetch Canva assets');
        }
    } catch (error) {
        console.error(`[CanvaUtils] Error fetching Canva assets (attempt ${retryCount + 1}):`, error);
        
        const shouldRetry = retryCount < maxRetries && (
            error.response?.status >= 500 ||
            error.code === 'NETWORK_ERROR' ||
            error.name === 'TimeoutError'
        );
        
        if (shouldRetry) {
            console.log(`[CanvaUtils] Retrying Canva assets fetch in ${(retryCount + 1) * 1000}ms...`);
            await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 1000));
            return fetchCanvaAssets(canvaConnected, isAuthenticated, retryCount + 1, maxRetries, onError);
        }
        
        // Generate user-friendly error message
        let errorMessage = 'Fehler beim Laden der Canva Assets';
        if (error.response?.status === 401) {
            errorMessage = 'Canva-Verbindung abgelaufen. Bitte verbinde dich erneut.';
        } else if (error.response?.status === 403) {
            errorMessage = 'Keine Berechtigung zum Zugriff auf Canva Assets.';
        } else if (error.response?.status >= 500) {
            errorMessage = 'Canva Server-Fehler. Bitte versuche es später erneut.';
        } else if (error.code === 'NETWORK_ERROR' || !navigator.onLine) {
            errorMessage = 'Netzwerkfehler. Bitte überprüfe deine Internetverbindung.';
        }
        
        onError?.(errorMessage);
        throw new Error(errorMessage);
    }
};

/**
 * Transform Canva API assets to internal structure
 * @param {Array} assets - Raw assets from Canva API
 * @returns {Array} Transformed asset objects
 */
export const transformCanvaAssets = (assets) => {
    return assets.map(asset => ({
        id: `canva_asset_${asset.id}`,
        asset_id: asset.id,
        name: asset.name || 'Unnamed Asset',
        type: asset.type, // 'image' or 'video'
        canva_id: asset.id,
        thumbnail_url: asset.thumbnail?.url,
        preview_image_url: asset.thumbnail?.url,
        created_at: asset.created_at ? new Date(asset.created_at * 1000).toISOString() : null,
        updated_at: asset.updated_at ? new Date(asset.updated_at * 1000).toISOString() : null,
        tags: asset.tags || [],
        source: 'canva_asset',
        width: asset.thumbnail?.width,
        height: asset.thumbnail?.height,
        metadata: {
            file_size: asset.file_size,
            format: asset.format,
            canva_asset_type: asset.type
        }
    }));
};

/**
 * Upload asset to Canva from local file
 * @param {File} file - File to upload
 * @param {string} name - Asset name
 * @param {Array} tags - Asset tags
 * @param {Function} onProgress - Progress callback
 * @param {Function} onError - Error callback
 * @returns {Promise<Object>} Upload job result
 */
export const uploadAssetToCanva = async (file, name, tags = [], onProgress = null, onError = null) => {
    try {
        console.log(`[CanvaUtils] Starting asset upload: ${name}`);
        
        // Create form data for file upload
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', name);
        if (tags.length > 0) {
            formData.append('tags', JSON.stringify(tags));
        }
        
        const response = await apiClient.post('/canva/assets/upload', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
            onUploadProgress: (progressEvent) => {
                if (onProgress && progressEvent.total) {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    onProgress(percentCompleted);
                }
            }
        });
        
        if (response.data.success) {
            console.log('[CanvaUtils] Asset upload job created:', response.data.job);
            return response.data.job;
        } else {
            throw new Error(response.data.error || 'Failed to create asset upload job');
        }
    } catch (error) {
        console.error('[CanvaUtils] Error uploading asset:', error);
        const errorMessage = 'Fehler beim Hochladen des Assets: ' + (error.message || 'Unbekannter Fehler');
        onError?.(errorMessage);
        throw new Error(errorMessage);
    }
};

/**
 * Upload asset to Canva from URL
 * @param {string} url - URL of asset to upload
 * @param {string} name - Asset name
 * @param {Array} tags - Asset tags
 * @param {Function} onError - Error callback
 * @returns {Promise<Object>} Upload job result
 */
export const uploadAssetFromUrlToCanva = async (url, name, tags = [], onError = null) => {
    try {
        console.log(`[CanvaUtils] Starting asset upload from URL: ${name}`);
        
        const response = await apiClient.post('/canva/assets/upload-url', {
            url,
            name,
            tags
        });
        
        if (response.data.success) {
            console.log('[CanvaUtils] Asset URL upload job created:', response.data.job);
            return response.data.job;
        } else {
            throw new Error(response.data.error || 'Failed to create asset URL upload job');
        }
    } catch (error) {
        console.error('[CanvaUtils] Error uploading asset from URL:', error);
        const errorMessage = 'Fehler beim Hochladen des Assets von URL: ' + (error.message || 'Unbekannter Fehler');
        onError?.(errorMessage);
        throw new Error(errorMessage);
    }
};

/**
 * Get status of asset upload job
 * @param {string} jobId - Upload job ID
 * @param {Function} onError - Error callback
 * @returns {Promise<Object>} Job status and result
 */
export const getAssetUploadJobStatus = async (jobId, onError = null) => {
    try {
        const response = await apiClient.get(`/canva/assets/upload-job/${jobId}`);
        
        if (response.data.success) {
            return response.data.job;
        } else {
            throw new Error(response.data.error || 'Failed to get upload job status');
        }
    } catch (error) {
        console.error('[CanvaUtils] Error getting upload job status:', error);
        const errorMessage = 'Fehler beim Abrufen des Upload-Status: ' + (error.message || 'Unbekannter Fehler');
        onError?.(errorMessage);
        throw new Error(errorMessage);
    }
};

/**
 * Delete Canva asset
 * @param {string} assetId - Asset ID to delete
 * @param {Function} onSuccess - Success callback
 * @param {Function} onError - Error callback
 * @returns {Promise<Object>} Delete result
 */
export const deleteCanvaAsset = async (assetId, onSuccess = null, onError = null) => {
    try {
        console.log(`[CanvaUtils] Deleting Canva asset: ${assetId}`);
        
        const response = await apiClient.delete(`/canva/assets/${assetId}`);
        
        if (response.data.success) {
            const successMsg = 'Canva Asset wurde erfolgreich gelöscht.';
            onSuccess?.(successMsg);
            console.log('[CanvaUtils] Asset deleted successfully');
            return response.data;
        } else {
            throw new Error(response.data.error || 'Failed to delete asset');
        }
    } catch (error) {
        console.error('[CanvaUtils] Error deleting asset:', error);
        const errorMessage = 'Fehler beim Löschen des Assets: ' + (error.message || 'Unbekannter Fehler');
        onError?.(errorMessage);
        throw new Error(errorMessage);
    }
};

/**
 * Update Canva asset metadata
 * @param {string} assetId - Asset ID to update
 * @param {Object} metadata - New metadata (name, tags)
 * @param {Function} onSuccess - Success callback
 * @param {Function} onError - Error callback
 * @returns {Promise<Object>} Update result
 */
export const updateCanvaAssetMetadata = async (assetId, metadata, onSuccess = null, onError = null) => {
    try {
        console.log(`[CanvaUtils] Updating Canva asset metadata: ${assetId}`);
        
        const response = await apiClient.put(`/canva/assets/${assetId}`, metadata);
        
        if (response.data.success) {
            const successMsg = 'Asset Metadaten wurden erfolgreich aktualisiert.';
            onSuccess?.(successMsg);
            console.log('[CanvaUtils] Asset metadata updated successfully');
            return response.data.asset;
        } else {
            throw new Error(response.data.error || 'Failed to update asset metadata');
        }
    } catch (error) {
        console.error('[CanvaUtils] Error updating asset metadata:', error);
        const errorMessage = 'Fehler beim Aktualisieren der Asset-Metadaten: ' + (error.message || 'Unbekannter Fehler');
        onError?.(errorMessage);
        throw new Error(errorMessage);
    }
};

/**
 * Poll upload job until completion
 * @param {string} jobId - Upload job ID
 * @param {Function} onProgress - Progress callback
 * @param {Function} onComplete - Completion callback
 * @param {Function} onError - Error callback
 * @param {number} maxAttempts - Maximum polling attempts
 * @returns {Promise<Object>} Final job result
 */
export const pollAssetUploadJob = async (
    jobId, 
    onProgress = null, 
    onComplete = null, 
    onError = null, 
    maxAttempts = 30
) => {
    let attempts = 0;
    
    const poll = async () => {
        try {
            attempts++;
            const job = await getAssetUploadJobStatus(jobId);
            
            if (job.status === 'success') {
                console.log('[CanvaUtils] Asset upload completed successfully');
                onComplete?.(job.asset);
                return job;
            } else if (job.status === 'failed') {
                const errorMsg = job.error?.message || 'Asset upload failed';
                onError?.(errorMsg);
                throw new Error(errorMsg);
            } else if (job.status === 'in_progress') {
                onProgress?.(`Upload wird verarbeitet... (${attempts}/${maxAttempts})`);
                
                if (attempts >= maxAttempts) {
                    const timeoutMsg = 'Upload-Timeout erreicht. Bitte versuche es später erneut.';
                    onError?.(timeoutMsg);
                    throw new Error(timeoutMsg);
                }
                
                // Wait 2 seconds before next poll
                await new Promise(resolve => setTimeout(resolve, 2000));
                return poll();
            }
        } catch (error) {
            console.error('[CanvaUtils] Error polling upload job:', error);
            onError?.(error.message);
            throw error;
        }
    };
    
    return poll();
};

// ============================================================================
// CONSTANTS & TYPE DEFINITIONS
// ============================================================================

/**
 * Template types for display
 */
export const CANVA_TEMPLATE_TYPES = {
    'canva': 'Canva Vorlage',
    'social_media': 'Social Media',
    'presentation': 'Präsentation',
    'flyer': 'Flyer',
    'poster': 'Poster',
    'newsletter': 'Newsletter',
    'instagram_post': 'Instagram Post',
    'facebook_post': 'Facebook Post',
    'story': 'Story',
    'canva_design': 'Canva Design'
};

/**
 * Asset types for display
 */
export const CANVA_ASSET_TYPES = {
    'image': 'Bild',
    'video': 'Video'
};

// ============================================================================
// ASSET PACKAGES SYSTEM
// ============================================================================

/**
 * Predefined asset packages for Grünerator
 */
export const ASSET_PACKAGES = [
    {
        id: 'gruenerator-logo',
        name: 'Grünerator Logo Paket',
        description: 'Offizielle Grünerator Logos für helle und dunkle Designs',
        category: 'branding',
        thumbnail: '/images/Logo_Grün.svg',
        assets: [
            {
                name: 'Grünerator Logo (Grün)',
                url: '/images/Logo_Grün.svg',
                type: 'image',
                tags: ['logo', 'gruenerator', 'grün', 'light-mode']
            },
            {
                name: 'Grünerator Logo (Sand)',
                url: '/images/Logo_Sand.svg',
                type: 'image',
                tags: ['logo', 'gruenerator', 'sand', 'dark-mode']
            }
        ]
    }
];

/**
 * Get asset package by ID
 * @param {string} packageId - Package ID
 * @returns {Object|null} Package object or null if not found
 */
export const getAssetPackage = (packageId) => {
    return ASSET_PACKAGES.find(pkg => pkg.id === packageId) || null;
};

/**
 * Get asset packages by category
 * @param {string} category - Category to filter by
 * @returns {Array} Array of packages in the category
 */
export const getAssetPackagesByCategory = (category) => {
    return ASSET_PACKAGES.filter(pkg => pkg.category === category);
};

/**
 * Import an entire asset package to user's Canva library
 * @param {string} packageId - Package ID to import
 * @param {Function} onProgress - Progress callback
 * @param {Function} onComplete - Completion callback
 * @param {Function} onError - Error callback
 * @returns {Promise<Object>} Import result
 */
export const importAssetPackage = async (packageId, onProgress = null, onComplete = null, onError = null) => {
    const packageData = getAssetPackage(packageId);
    if (!packageData) {
        const error = 'Asset Package nicht gefunden.';
        onError?.(error);
        throw new Error(error);
    }

    try {
        console.log(`[CanvaUtils] Importing asset package: ${packageData.name}`);
        
        const totalAssets = packageData.assets.length;
        let completedAssets = 0;
        const importResults = [];
        const failedAssets = [];

        // Import each asset from the package
        for (const asset of packageData.assets) {
            try {
                onProgress?.(`Importiere "${asset.name}" (${completedAssets + 1}/${totalAssets})`);
                
                const job = await uploadAssetFromUrlToCanva(
                    asset.url,
                    asset.name,
                    [...asset.tags, `package-${packageId}`],
                    onError
                );

                // Poll for completion
                const result = await pollAssetUploadJob(
                    job.id,
                    null, // No individual progress for package import
                    (importedAsset) => {
                        importResults.push({
                            original: asset,
                            imported: importedAsset
                        });
                    },
                    (error) => {
                        console.error(`[CanvaUtils] Failed to import asset "${asset.name}":`, error);
                        failedAssets.push({ asset, error });
                    }
                );

                completedAssets++;
                
            } catch (error) {
                console.error(`[CanvaUtils] Error importing asset "${asset.name}":`, error);
                failedAssets.push({ asset, error: error.message });
                completedAssets++;
            }
        }

        const result = {
            packageId,
            packageName: packageData.name,
            totalAssets,
            importedAssets: importResults.length,
            failedAssets: failedAssets.length,
            results: importResults,
            failures: failedAssets
        };

        if (failedAssets.length === 0) {
            const successMsg = `Asset Package "${packageData.name}" wurde erfolgreich importiert! ${importResults.length} Assets hinzugefügt.`;
            onComplete?.(result);
            console.log('[CanvaUtils] Package import completed successfully:', result);
        } else {
            const warningMsg = `Asset Package "${packageData.name}" teilweise importiert: ${importResults.length} erfolgreich, ${failedAssets.length} fehlgeschlagen.`;
            onComplete?.(result);
            console.warn('[CanvaUtils] Package import completed with warnings:', result);
        }

        return result;

    } catch (error) {
        console.error('[CanvaUtils] Error importing asset package:', error);
        const errorMessage = 'Fehler beim Importieren des Asset Packages: ' + error.message;
        onError?.(errorMessage);
        throw new Error(errorMessage);
    }
};

/**
 * Check if a package has been imported by the user
 * @param {string} packageId - Package ID
 * @returns {boolean} True if package has been imported
 */
export const isPackageImported = (packageId) => {
    // This would typically check against user's imported packages
    // For now, we'll use localStorage to track this
    const importedPackages = JSON.parse(localStorage.getItem('canva_imported_packages') || '[]');
    return importedPackages.includes(packageId);
};

/**
 * Mark a package as imported
 * @param {string} packageId - Package ID
 */
export const markPackageAsImported = (packageId) => {
    const importedPackages = JSON.parse(localStorage.getItem('canva_imported_packages') || '[]');
    if (!importedPackages.includes(packageId)) {
        importedPackages.push(packageId);
        localStorage.setItem('canva_imported_packages', JSON.stringify(importedPackages));
    }
};

/**
 * Get all imported package IDs
 * @returns {Array} Array of imported package IDs
 */
export const getImportedPackages = () => {
    return JSON.parse(localStorage.getItem('canva_imported_packages') || '[]');
};

/**
 * Default error messages for common scenarios
 */
export const CANVA_ERROR_MESSAGES = {
    NO_CONNECTION: 'Nicht mit Canva verbunden.',
    INVALID_URL: 'Ungültige Canva URL.',
    NETWORK_ERROR: 'Netzwerkfehler beim Verbinden mit Canva.',
    AUTH_EXPIRED: 'Canva-Verbindung abgelaufen. Bitte verbinde dich erneut.',
    PERMISSION_DENIED: 'Keine Berechtigung zum Zugriff auf Canva Designs.',
    SERVER_ERROR: 'Canva Server-Fehler. Bitte versuche es später erneut.'
};