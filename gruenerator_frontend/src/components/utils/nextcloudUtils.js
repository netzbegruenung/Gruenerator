import apiClient from './apiClient';

// Constants
export const NEXTCLOUD_SHARE_TYPES = {
    PUBLIC_WRITABLE: 'public_writable',
    PUBLIC_READONLY: 'public_readonly',
    INVALID: 'invalid'
};

export const NEXTCLOUD_STATUS = {
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    ERROR: 'error'
};

// Share link validation
export const validateShareLink = (url) => {
    if (!url || typeof url !== 'string') {
        return { isValid: false, error: 'URL ist erforderlich' };
    }

    try {
        const urlObj = new URL(url);
        
        // Check if it's a valid Wolke share URL pattern
        const shareRegex = /\/s\/[A-Za-z0-9]+/;
        if (!shareRegex.test(urlObj.pathname)) {
            return { isValid: false, error: 'Ungültiges Wolke-Share-Link-Format' };
        }

        return { isValid: true, error: null };
    } catch (error) {
        return { isValid: false, error: 'Ungültige URL' };
    }
};

// Extract share token and base URL from share link
export const parseShareLink = (shareLink) => {
    try {
        const urlObj = new URL(shareLink);
        const pathMatch = urlObj.pathname.match(/\/s\/([A-Za-z0-9]+)/);
        
        if (!pathMatch) {
            return null;
        }

        return {
            baseUrl: `${urlObj.protocol}//${urlObj.host}`,
            shareToken: pathMatch[1],
            fullPath: urlObj.pathname + urlObj.search
        };
    } catch (error) {
        console.error('[nextcloudUtils] Error parsing share link:', error);
        return null;
    }
};

// API Functions
export const getNextcloudShareLinks = async () => {
    try {
        const response = await apiClient.get('/nextcloud/share-links');
        return response.data;
    } catch (error) {
        console.error('[nextcloudUtils] Error fetching share links:', error);
        throw new Error('Fehler beim Laden der Wolke-Verbindungen: ' + error.message);
    }
};

export const saveNextcloudShareLink = async (shareLink, label = '') => {
    const validation = validateShareLink(shareLink);
    if (!validation.isValid) {
        throw new Error(validation.error);
    }

    const parsedLink = parseShareLink(shareLink);
    if (!parsedLink) {
        throw new Error('Ungültiger Wolke-Share-Link');
    }

    try {
        const response = await apiClient.post('/nextcloud/share-links', {
            shareLink: shareLink.trim(),
            label: label.trim(),
            baseUrl: parsedLink.baseUrl,
            shareToken: parsedLink.shareToken
        });
        return response.data;
    } catch (error) {
        console.error('[nextcloudUtils] Error saving share link:', error);
        throw new Error('Fehler beim Speichern der Wolke-Verbindung: ' + error.message);
    }
};

export const deleteNextcloudShareLink = async (shareLinkId) => {
    try {
        await apiClient.delete(`/nextcloud/share-links/${shareLinkId}`);
    } catch (error) {
        console.error('[nextcloudUtils] Error deleting share link:', error);
        throw new Error('Fehler beim Löschen der Wolke-Verbindung: ' + error.message);
    }
};

export const testNextcloudConnection = async (shareLink) => {
    const validation = validateShareLink(shareLink);
    if (!validation.isValid) {
        throw new Error(validation.error);
    }

    try {
        const response = await apiClient.post('/nextcloud/test-connection', {
            shareLink: shareLink.trim()
        });
        return response.data;
    } catch (error) {
        console.error('[nextcloudUtils] Error testing connection:', error);
        throw new Error('Fehler beim Testen der Wolke-Verbindung: ' + error.message);
    }
};

export const uploadToNextcloudShare = async (shareLinkId, content, filename = 'hello-world.txt') => {
    if (!shareLinkId) {
        throw new Error('Share Link ID ist erforderlich');
    }

    if (!content) {
        throw new Error('Inhalt ist erforderlich');
    }

    try {
        const response = await apiClient.post('/nextcloud/upload', {
            shareLinkId,
            content,
            filename
        });
        return response.data;
    } catch (error) {
        console.error('[nextcloudUtils] Error uploading to Wolke:', error);
        throw new Error('Fehler beim Upload zu Wolke: ' + error.message);
    }
};

// UI Helper Functions
export const getNextcloudConnectionStatus = (shareLinks) => {
    if (!Array.isArray(shareLinks)) {
        return NEXTCLOUD_STATUS.ERROR;
    }

    const activeLinks = shareLinks.filter(link => link.is_active);
    
    if (activeLinks.length > 0) {
        return NEXTCLOUD_STATUS.CONNECTED;
    }
    
    return NEXTCLOUD_STATUS.DISCONNECTED;
};

export const generateShareLinkDisplayName = (shareLink, label) => {
    if (label && label.trim()) {
        return label.trim();
    }

    const parsed = parseShareLink(shareLink.share_link || shareLink);
    if (parsed) {
        return `${parsed.baseUrl.replace(/^https?:\/\//, '')} (${parsed.shareToken})`;
    }

    return 'Unbenannte Verbindung';
};

export const copyToClipboard = async (text, type = 'Link', onSuccess, onError, onClose) => {
    try {
        await navigator.clipboard.writeText(text);
        if (onSuccess) {
            onSuccess(`${type} wurde in die Zwischenablage kopiert.`);
        }
        if (onClose) {
            onClose();
        }
    } catch (error) {
        console.error('[nextcloudUtils] Error copying to clipboard:', error);
        if (onError) {
            onError(`Fehler beim Kopieren des ${type}s: ` + error.message);
        }
    }
};

// Action Items Generator
export const generateNextcloudActionItems = (shareLink, handlers) => {
    const actions = [];

    // Test connection action
    actions.push({
        icon: 'HiRefresh',
        label: 'Verbindung testen',
        onClick: () => handlers.onTestConnection?.(shareLink),
        className: 'action-test',
        disabled: !shareLink.is_active
    });

    // Upload test file action
    actions.push({
        icon: 'HiUpload',
        label: 'Test-Upload',
        onClick: () => handlers.onTestUpload?.(shareLink),
        className: 'action-upload',
        disabled: !shareLink.is_active
    });

    // Copy link action
    actions.push({
        icon: 'HiClipboard',
        label: 'Link kopieren',
        onClick: () => handlers.onCopyLink?.(shareLink.share_link, 'Share-Link'),
        className: 'action-copy'
    });

    // Delete action
    actions.push({
        icon: 'HiOutlineTrash',
        label: 'Löschen',
        onClick: () => handlers.onDelete?.(shareLink.id),
        className: 'action-delete-danger',
        confirmMessage: 'Möchten Sie diese Wolke-Verbindung wirklich löschen?'
    });

    return actions;
};

// Error handling helpers
export const handleNextcloudError = (error, onError) => {
    console.error('[nextcloudUtils] Wolke error:', error);
    
    let userMessage = 'Ein unbekannter Fehler ist aufgetreten.';
    
    if (error.response) {
        // Server responded with error status
        switch (error.response.status) {
            case 401:
                userMessage = 'Keine Berechtigung für diese Wolke-Operation.';
                break;
            case 403:
                userMessage = 'Der Share-Link ist nicht beschreibbar oder wurde deaktiviert.';
                break;
            case 404:
                userMessage = 'Wolke-Share nicht gefunden oder ungültig.';
                break;
            case 507:
                userMessage = 'Nicht genügend Speicherplatz in der Wolke.';
                break;
            default:
                userMessage = error.response.data?.message || `Server-Fehler: ${error.response.status}`;
        }
    } else if (error.request) {
        userMessage = 'Keine Verbindung zur Wolke möglich. Prüfen Sie Ihre Internetverbindung.';
    } else if (error.message) {
        userMessage = error.message;
    }

    if (onError) {
        onError(userMessage);
    }
    
    return userMessage;
};