import apiClient from '../components/utils/apiClient';

/**
 * Interface for a Nextcloud share link record
 */
export interface ShareLink {
    id: string;
    user_id?: string;
    share_link?: string;
    label?: string;
    base_url?: string;
    share_token?: string;
    folder_name?: string;
    is_active?: boolean;
    created_at?: string;
    updated_at?: string;
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    [key: string]: any;
}

/**
 * Interface for share link updates
 */
export interface ShareLinkUpdate {
    label?: string;
    share_link?: string;
    base_url?: string;
    share_token?: string;
    is_active?: boolean;
}

/**
 * Interface for share link validation result
 */
export interface ShareLinkValidationResult {
    isValid: boolean;
    shareToken?: string;
    baseUrl?: string;
    error: string | null;
}

/**
 * Interface for parsed share link components
 */
export interface ParsedShareLink {
    baseUrl: string;
    shareToken: string;
    fullPath: string;
}

/**
 * Interface for usage statistics
 */
export interface UsageStats {
    totalLinks: number;
    activeLinks: number;
    inactiveLinks: number;
    oldestLink: Date | null;
    newestLink: Date | null;
}

/**
 * Interface for API response data
 */
interface ApiResponseData {
    success?: boolean;
    shareLinks?: ShareLink[];
    shareLink?: ShareLink;
    message?: string;
    [key: string]: unknown;
}

/**
 * NextcloudShareManager - Frontend utility for managing Nextcloud share links
 * This mirrors the backend functionality but calls API endpoints instead of direct DB access
 */
export class NextcloudShareManager {
    /**
     * Get all share links for the current user
     */
    static async getShareLinks(): Promise<ShareLink[]> {
        try {
            const response = await apiClient.get<ApiResponseData>('/nextcloud/share-links');

            if (response.data && response.data.success) {
                return response.data.shareLinks || [];
            } else {
                throw new Error('Failed to get share links');
            }
        } catch (error) {
            console.error('[NextcloudShareManager] Error getting share links:', error);
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Fehler beim Laden der Wolke-Links: ${message}`);
        }
    }

    /**
     * Get a specific share link by ID
     */
    static async getShareLinkById(shareLinkId: string): Promise<ShareLink> {
        try {
            // Backend does not expose /nextcloud/share-links/:id; fetch all and filter
            const response = await apiClient.get<ApiResponseData>('/nextcloud/share-links');
            if (!(response.data && response.data.success)) {
                throw new Error('Failed to load share links');
            }
            const shareLinks: ShareLink[] = response.data.shareLinks || [];
            const link = shareLinks.find((l: ShareLink) => String(l.id) === String(shareLinkId));
            if (!link) {
                throw new Error('Share link not found');
            }
            return link;
        } catch (error) {
            console.error('[NextcloudShareManager] Error getting share link by ID:', error);
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Fehler beim Laden des Wolke-Links: ${message}`);
        }
    }

    /**
     * Save a new share link
     */
    static async saveShareLink(shareLink: string, label = '', baseUrl = '', shareToken = ''): Promise<ShareLink> {
        try {
            const response = await apiClient.post<ApiResponseData>('/nextcloud/share-links', {
                shareLink: shareLink.trim(),
                label: label.trim(),
                baseUrl,
                shareToken
            });

            if (response.data && response.data.success && response.data.shareLink) {
                return response.data.shareLink;
            } else {
                throw new Error('Failed to save share link');
            }
        } catch (error) {
            console.error('[NextcloudShareManager] Error saving share link:', error);
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Fehler beim Speichern des Wolke-Links: ${message}`);
        }
    }

    /**
     * Update a share link
     */
    static async updateShareLink(shareLinkId: string, updates: ShareLinkUpdate): Promise<ShareLink> {
        try {
            const response = await apiClient.put<ApiResponseData>(`/nextcloud/share-links/${shareLinkId}`, updates);

            if (response.data && response.data.success && response.data.shareLink) {
                return response.data.shareLink;
            } else {
                throw new Error('Failed to update share link');
            }
        } catch (error) {
            console.error('[NextcloudShareManager] Error updating share link:', error);
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Fehler beim Aktualisieren des Wolke-Links: ${message}`);
        }
    }

    /**
     * Delete a share link
     */
    static async deleteShareLink(shareLinkId: string): Promise<{ success: boolean; deletedId: string }> {
        try {
            const response = await apiClient.delete<ApiResponseData>(`/nextcloud/share-links/${shareLinkId}`);

            if (response.data && response.data.success) {
                return { success: true, deletedId: shareLinkId };
            } else {
                throw new Error('Failed to delete share link');
            }
        } catch (error) {
            console.error('[NextcloudShareManager] Error deleting share link:', error);
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Fehler beim Löschen des Wolke-Links: ${message}`);
        }
    }

    /**
     * Test connection to a share link
     */
    static async testConnection(shareLink: string): Promise<ApiResponseData> {
        try {
            const response = await apiClient.post<ApiResponseData>('/nextcloud/test-connection', {
                shareLink: shareLink.trim()
            });

            if (response.data && response.data.success) {
                return response.data;
            } else {
                throw new Error('Connection test failed');
            }
        } catch (error) {
            console.error('[NextcloudShareManager] Error testing connection:', error);
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Fehler beim Testen der Verbindung: ${message}`);
        }
    }

    /**
     * Upload a test file to a share link
     */
    static async uploadTest(shareLinkId: string, content: string, filename = 'gruenerator-test.txt'): Promise<ApiResponseData> {
        try {
            const response = await apiClient.post<ApiResponseData>('/nextcloud/upload-test', {
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
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Fehler beim Test-Upload: ${message}`);
        }
    }

    /**
     * Upload a file to a share link (non-test endpoint)
     * Maintains compatibility with older utility usage
     */
    static async upload(shareLinkId: string, content: string, filename = 'file.txt'): Promise<ApiResponseData> {
        try {
            const response = await apiClient.post<ApiResponseData>('/nextcloud/upload', {
                shareLinkId,
                content,
                filename
            });

            if (response.data) {
                return response.data;
            } else {
                throw new Error('Upload failed');
            }
        } catch (error) {
            console.error('[NextcloudShareManager] Error uploading file:', error);
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Fehler beim Upload: ${message}`);
        }
    }

    /**
     * Validate share link format
     */
    static validateShareLink(shareLink: string): ShareLinkValidationResult {
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
        } catch {
            return {
                isValid: false,
                error: 'Ungültiges URL-Format'
            };
        }
    }

    /**
     * Get usage statistics
     */
    static async getUsageStats(): Promise<UsageStats> {
        try {
            const shareLinks = await this.getShareLinks();

            const linksWithDates = shareLinks.filter((link: ShareLink) => link.created_at);
            const oldestLinkTime = linksWithDates.length > 0 ?
                Math.min(...linksWithDates.map((link: ShareLink) => new Date(link.created_at!).getTime())) : null;
            const newestLinkTime = linksWithDates.length > 0 ?
                Math.max(...linksWithDates.map((link: ShareLink) => new Date(link.created_at!).getTime())) : null;

            const stats: UsageStats = {
                totalLinks: shareLinks.length,
                activeLinks: shareLinks.filter((link: ShareLink) => link.is_active).length,
                inactiveLinks: shareLinks.filter((link: ShareLink) => !link.is_active).length,
                oldestLink: oldestLinkTime ? new Date(oldestLinkTime) : null,
                newestLink: newestLinkTime ? new Date(newestLinkTime) : null
            };

            return stats;
        } catch (error) {
            console.error('[NextcloudShareManager] Error getting usage stats:', error);
            throw error;
        }
    }

    /**
     * Parse share link to extract components
     */
    static parseShareLink(shareLink: string): ParsedShareLink | null {
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
    static generateDisplayName(shareLink: ShareLink, fallback = 'Unbenannte Verbindung'): string {
        if (shareLink.label && shareLink.label.trim()) {
            return shareLink.label.trim();
        }

        if (shareLink.share_link) {
            const parsed = this.parseShareLink(shareLink.share_link);
            if (parsed) {
                return `${parsed.baseUrl.replace(/^https?:\/\//, '')} (${parsed.shareToken})`;
            }
        }

        return fallback;
    }

    /**
     * Generate display URL for sharing
     */
    static generateDisplayUrl(shareLink: ShareLink): string {
        if (shareLink.share_link) {
            return shareLink.share_link.replace(/^https?:\/\//, '');
        }
        return 'Ungültige URL';
    }
}

export default NextcloudShareManager;
