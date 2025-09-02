import apiClient from '../components/utils/apiClient';

/**
 * NextcloudShareManager - Frontend utility for managing Nextcloud share links
 * This mirrors the backend functionality but calls API endpoints instead of direct DB access
 */
export class NextcloudShareManager {
    /**
     * Get all share links for the current user
     */
    static async getShareLinks() {
        try {
            const response = await apiClient.get('/nextcloud/share-links');
            
            if (response.data && response.data.success) {
                return response.data.shareLinks || [];
            } else {
                throw new Error('Failed to get share links');
            }
        } catch (error) {
            console.error('[NextcloudShareManager] Error getting share links:', error);
            throw new Error(`Fehler beim Laden der Wolke-Links: ${error.message}`);
        }
    }

    /**
     * Get a specific share link by ID
     */
    static async getShareLinkById(shareLinkId) {
        try {
            const response = await apiClient.get(`/nextcloud/share-links/${shareLinkId}`);
            
            if (response.data && response.data.success) {
                return response.data.shareLink;
            } else {
                throw new Error('Share link not found');
            }
        } catch (error) {
            console.error('[NextcloudShareManager] Error getting share link by ID:', error);
            throw new Error(`Fehler beim Laden des Wolke-Links: ${error.message}`);
        }
    }

    /**
     * Save a new share link
     */
    static async saveShareLink(shareLink, label = '', baseUrl = '', shareToken = '') {
        try {
            const response = await apiClient.post('/nextcloud/share-links', {
                shareLink: shareLink.trim(),
                label: label.trim(),
                baseUrl,
                shareToken
            });
            
            if (response.data && response.data.success) {
                return response.data.shareLink;
            } else {
                throw new Error('Failed to save share link');
            }
        } catch (error) {
            console.error('[NextcloudShareManager] Error saving share link:', error);
            throw new Error(`Fehler beim Speichern des Wolke-Links: ${error.message}`);
        }
    }

    /**
     * Update a share link
     */
    static async updateShareLink(shareLinkId, updates) {
        try {
            const response = await apiClient.put(`/nextcloud/share-links/${shareLinkId}`, updates);
            
            if (response.data && response.data.success) {
                return response.data.shareLink;
            } else {
                throw new Error('Failed to update share link');
            }
        } catch (error) {
            console.error('[NextcloudShareManager] Error updating share link:', error);
            throw new Error(`Fehler beim Aktualisieren des Wolke-Links: ${error.message}`);
        }
    }

    /**
     * Delete a share link
     */
    static async deleteShareLink(shareLinkId) {
        try {
            const response = await apiClient.delete(`/nextcloud/share-links/${shareLinkId}`);
            
            if (response.data && response.data.success) {
                return { success: true, deletedId: shareLinkId };
            } else {
                throw new Error('Failed to delete share link');
            }
        } catch (error) {
            console.error('[NextcloudShareManager] Error deleting share link:', error);
            throw new Error(`Fehler beim Löschen des Wolke-Links: ${error.message}`);
        }
    }

    /**
     * Test connection to a share link
     */
    static async testConnection(shareLink) {
        try {
            const response = await apiClient.post('/nextcloud/test-connection', {
                shareLink: shareLink.trim()
            });
            
            if (response.data && response.data.success) {
                return response.data;
            } else {
                throw new Error('Connection test failed');
            }
        } catch (error) {
            console.error('[NextcloudShareManager] Error testing connection:', error);
            throw new Error(`Fehler beim Testen der Verbindung: ${error.message}`);
        }
    }

    /**
     * Upload a test file to a share link
     */
    static async uploadTest(shareLinkId, content, filename = 'gruenerator-test.txt') {
        try {
            const response = await apiClient.post('/nextcloud/upload-test', {
                shareLinkId,
                content,
                filename
            });
            
            if (response.data && response.data.success) {
                return response.data;
            } else {
                throw new Error('Upload test failed');
            }
        } catch (error) {
            console.error('[NextcloudShareManager] Error uploading test file:', error);
            throw new Error(`Fehler beim Test-Upload: ${error.message}`);
        }
    }

    /**
     * Validate share link format
     */
    static validateShareLink(shareLink) {
        if (!shareLink || typeof shareLink !== 'string') {
            return {
                isValid: false,
                error: 'Share link ist erforderlich'
            };
        }

        try {
            const urlObj = new URL(shareLink);
            
            // Check if it matches Nextcloud share pattern
            const sharePattern = /\/s\/[A-Za-z0-9]+/;
            if (!sharePattern.test(urlObj.pathname)) {
                return {
                    isValid: false,
                    error: 'Ungültiges Nextcloud Share-Link Format'
                };
            }

            // Extract share token
            const tokenMatch = urlObj.pathname.match(/\/s\/([A-Za-z0-9]+)/);
            if (!tokenMatch) {
                return {
                    isValid: false,
                    error: 'Share-Token konnte nicht extrahiert werden'
                };
            }

            return {
                isValid: true,
                shareToken: tokenMatch[1],
                baseUrl: `${urlObj.protocol}//${urlObj.host}`,
                error: null
            };
        } catch (error) {
            return {
                isValid: false,
                error: 'Ungültiges URL-Format'
            };
        }
    }

    /**
     * Get usage statistics
     */
    static async getUsageStats() {
        try {
            const shareLinks = await this.getShareLinks();
            
            const stats = {
                totalLinks: shareLinks.length,
                activeLinks: shareLinks.filter(link => link.is_active).length,
                inactiveLinks: shareLinks.filter(link => !link.is_active).length,
                oldestLink: shareLinks.length > 0 ? 
                    Math.min(...shareLinks.map(link => new Date(link.created_at).getTime())) : null,
                newestLink: shareLinks.length > 0 ? 
                    Math.max(...shareLinks.map(link => new Date(link.created_at).getTime())) : null
            };

            if (stats.oldestLink) {
                stats.oldestLink = new Date(stats.oldestLink);
            }
            if (stats.newestLink) {
                stats.newestLink = new Date(stats.newestLink);
            }

            return stats;
        } catch (error) {
            console.error('[NextcloudShareManager] Error getting usage stats:', error);
            throw error;
        }
    }

    /**
     * Parse share link to extract components
     */
    static parseShareLink(shareLink) {
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
            console.error('[NextcloudShareManager] Error parsing share link:', error);
            return null;
        }
    }

    /**
     * Generate display name for a share link
     */
    static generateDisplayName(shareLink, fallback = 'Unbenannte Verbindung') {
        if (shareLink.label && shareLink.label.trim()) {
            return shareLink.label.trim();
        }

        const parsed = this.parseShareLink(shareLink.share_link);
        if (parsed) {
            return `${parsed.baseUrl.replace(/^https?:\/\//, '')} (${parsed.shareToken})`;
        }

        return fallback;
    }

    /**
     * Generate display URL for sharing
     */
    static generateDisplayUrl(shareLink) {
        if (shareLink.share_link) {
            return shareLink.share_link.replace(/^https?:\/\//, '');
        }
        return 'Ungültige URL';
    }
}

export default NextcloudShareManager;