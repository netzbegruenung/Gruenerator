/**
 * Nextcloud Share Manager
 * Manages Nextcloud share links for users
 */

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import type {
  NextcloudShareLink,
  ShareLinkValidation,
  ShareLinkDeletionResult,
  DeactivationResult,
  UsageStats,
  DatabaseStateCheck,
  ShareLinkUpdates
} from './types.js';

export class NextcloudShareManager {
  /**
   * Get PostgreSQL instance
   */
  private static async getPostgres() {
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();
    return postgres;
  }

  /**
   * Save a new Nextcloud share link for a user
   */
  static async saveShareLink(
    userId: string,
    shareLink: string,
    label: string = '',
    baseUrl: string = '',
    shareToken: string = ''
  ): Promise<NextcloudShareLink> {
    try {
      console.log('[NextcloudShareManager] Saving Nextcloud share link', { userId, label });

      // Validate inputs
      if (!userId) {
        throw new Error('User ID is required');
      }

      if (!shareLink) {
        throw new Error('Share link is required');
      }

      const postgres = await this.getPostgres();

      // Get current profile to check existing links
      const profile = await postgres.queryOne(
        'SELECT nextcloud_share_links FROM profiles WHERE id = $1',
        [userId],
        { table: 'profiles' }
      );

      const rawCurrentLinks = profile?.nextcloud_share_links;
      const currentLinks: NextcloudShareLink[] = Array.isArray(rawCurrentLinks) ? rawCurrentLinks : [];

      // Check if share link already exists
      const existingLink = currentLinks.find((link: NextcloudShareLink) => link.share_link === shareLink);
      if (existingLink) {
        throw new Error('This share link is already saved');
      }

      // Create new link object
      const newLink: NextcloudShareLink = {
        id: Date.now().toString(), // Simple ID based on timestamp
        share_link: shareLink,
        label: label || null,
        base_url: baseUrl || null,
        share_token: shareToken || null,
        is_active: true,
        created_at: new Date().toISOString()
      };

      // Add to existing links
      const updatedLinks = [...currentLinks, newLink];

      // Update the profile with new links
      const result = await postgres.update(
        'profiles',
        { nextcloud_share_links: JSON.stringify(updatedLinks) },
        { id: userId }
      );

      if (!result) {
        throw new Error('Failed to save share link - profile not found');
      }

      console.log('[NextcloudShareManager] Share link saved successfully', { shareLinkId: newLink.id });
      return newLink;

    } catch (error) {
      console.error('[NextcloudShareManager] Error in saveShareLink', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get all share links for a user
   */
  static async getShareLinks(userId: string): Promise<NextcloudShareLink[]> {
    try {
      console.log('[NextcloudShareManager] Getting share links for user', { userId });

      if (!userId) {
        throw new Error('User ID is required');
      }

      const postgres = await this.getPostgres();

      const profile = await postgres.queryOne(
        'SELECT nextcloud_share_links FROM profiles WHERE id = $1',
        [userId],
        { table: 'profiles' }
      );

      const rawShareLinks = profile?.nextcloud_share_links;
      const shareLinks: NextcloudShareLink[] = Array.isArray(rawShareLinks) ? rawShareLinks : [];

      // Sort by created_at descending (newest first)
      const sortedLinks = shareLinks.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      console.log('[NextcloudShareManager] Retrieved share links', { userId, count: sortedLinks.length });
      return sortedLinks;

    } catch (error) {
      console.error('[NextcloudShareManager] Error in getShareLinks', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get a specific share link by ID
   */
  static async getShareLinkById(userId: string, shareLinkId: string): Promise<NextcloudShareLink> {
    try {
      console.log('[NextcloudShareManager] Getting share link by ID', { userId, shareLinkId });

      if (!userId || !shareLinkId) {
        throw new Error('User ID and share link ID are required');
      }

      const postgres = await this.getPostgres();

      const profile = await postgres.queryOne(
        'SELECT nextcloud_share_links FROM profiles WHERE id = $1',
        [userId],
        { table: 'profiles' }
      );

      const rawShareLinksById = profile?.nextcloud_share_links;
      const shareLinks: NextcloudShareLink[] = Array.isArray(rawShareLinksById) ? rawShareLinksById : [];
      const shareLink = shareLinks.find((link: NextcloudShareLink) => link.id === shareLinkId);

      if (!shareLink) {
        throw new Error('Share link not found');
      }

      return shareLink;

    } catch (error) {
      console.error('[NextcloudShareManager] Error in getShareLinkById', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Update a share link
   */
  static async updateShareLink(
    userId: string,
    shareLinkId: string,
    updates: ShareLinkUpdates
  ): Promise<NextcloudShareLink> {
    try {
      console.log('[NextcloudShareManager] Updating share link', { userId, shareLinkId, updates });

      if (!userId || !shareLinkId) {
        throw new Error('User ID and share link ID are required');
      }

      const postgres = await this.getPostgres();

      // Get current profile
      const profile = await postgres.queryOne(
        'SELECT nextcloud_share_links FROM profiles WHERE id = $1',
        [userId],
        { table: 'profiles' }
      );

      const rawCurrentLinksUpdate = profile?.nextcloud_share_links;
      const currentLinks: NextcloudShareLink[] = Array.isArray(rawCurrentLinksUpdate) ? rawCurrentLinksUpdate : [];
      const linkIndex = currentLinks.findIndex((link: NextcloudShareLink) => link.id === shareLinkId);

      if (linkIndex === -1) {
        throw new Error('Share link not found or no permission to update');
      }

      // Update the link
      const updatedLink: NextcloudShareLink = {
        ...currentLinks[linkIndex],
        ...updates,
        updated_at: new Date().toISOString()
      };

      // Replace the link in the array
      const updatedLinks = [...currentLinks];
      updatedLinks[linkIndex] = updatedLink;

      // Update the profile
      const result = await postgres.update(
        'profiles',
        { nextcloud_share_links: JSON.stringify(updatedLinks) },
        { id: userId }
      );

      if (!result) {
        throw new Error('Failed to update share link - profile not found');
      }

      console.log('[NextcloudShareManager] Share link updated successfully', { shareLinkId: updatedLink.id });
      return updatedLink;

    } catch (error) {
      console.error('[NextcloudShareManager] Error in updateShareLink', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Delete a share link
   */
  static async deleteShareLink(userId: string, shareLinkId: string): Promise<ShareLinkDeletionResult> {
    try {
      console.log('[NextcloudShareManager] Deleting share link', { userId, shareLinkId });

      if (!userId || !shareLinkId) {
        throw new Error('User ID and share link ID are required');
      }

      const postgres = await this.getPostgres();

      // Get current profile
      const profile = await postgres.queryOne(
        'SELECT nextcloud_share_links FROM profiles WHERE id = $1',
        [userId],
        { table: 'profiles' }
      );

      const rawCurrentLinksDelete = profile?.nextcloud_share_links;
      const currentLinks: NextcloudShareLink[] = Array.isArray(rawCurrentLinksDelete) ? rawCurrentLinksDelete : [];
      const linkToDelete = currentLinks.find((link: NextcloudShareLink) => link.id === shareLinkId);

      if (!linkToDelete) {
        throw new Error('Share link not found or no permission to delete');
      }

      // Remove the link from the array
      const updatedLinks = currentLinks.filter((link: NextcloudShareLink) => link.id !== shareLinkId);

      // Update the profile
      const result = await postgres.update(
        'profiles',
        { nextcloud_share_links: JSON.stringify(updatedLinks) },
        { id: userId }
      );

      if (!result) {
        throw new Error('Failed to delete share link - profile not found');
      }

      console.log('[NextcloudShareManager] Share link deleted successfully', { shareLinkId });
      return { success: true, deletedId: shareLinkId };

    } catch (error) {
      console.error('[NextcloudShareManager] Error in deleteShareLink', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Validate share link format
   */
  static validateShareLink(shareLink: string): ShareLinkValidation {
    try {
      if (!shareLink || typeof shareLink !== 'string') {
        return {
          isValid: false,
          error: 'Share link is required and must be a string'
        };
      }

      // Check if it's a valid URL
      let urlObj: URL;
      try {
        urlObj = new URL(shareLink);
      } catch (error) {
        return {
          isValid: false,
          error: 'Invalid URL format'
        };
      }

      // Check if it matches Nextcloud share pattern
      const sharePattern = /\/s\/[A-Za-z0-9]+/;
      if (!sharePattern.test(urlObj.pathname)) {
        return {
          isValid: false,
          error: 'Invalid Nextcloud share link format'
        };
      }

      // Extract share token
      const tokenMatch = urlObj.pathname.match(/\/s\/([A-Za-z0-9]+)/);
      if (!tokenMatch) {
        return {
          isValid: false,
          error: 'Could not extract share token'
        };
      }

      return {
        isValid: true,
        shareToken: tokenMatch[1],
        baseUrl: `${urlObj.protocol}//${urlObj.host}`,
        error: null
      };

    } catch (error) {
      console.error('[NextcloudShareManager] Error validating share link', { error: (error as Error).message });
      return {
        isValid: false,
        error: 'Validation error: ' + (error as Error).message
      };
    }
  }

  /**
   * Deactivate all share links for a user (useful for security)
   */
  static async deactivateAllShareLinks(userId: string): Promise<DeactivationResult> {
    try {
      console.log('[NextcloudShareManager] Deactivating all share links for user', { userId });

      if (!userId) {
        throw new Error('User ID is required');
      }

      const postgres = await this.getPostgres();

      // Get current profile
      const profile = await postgres.queryOne(
        'SELECT nextcloud_share_links FROM profiles WHERE id = $1',
        [userId],
        { table: 'profiles' }
      );

      const rawCurrentLinksDeactivate = profile?.nextcloud_share_links;
      const currentLinks: NextcloudShareLink[] = Array.isArray(rawCurrentLinksDeactivate) ? rawCurrentLinksDeactivate : [];

      // Deactivate all links
      const updatedLinks = currentLinks.map((link: NextcloudShareLink) => ({
        ...link,
        is_active: false,
        updated_at: new Date().toISOString()
      }));

      // Update the profile if there were any links to deactivate
      if (currentLinks.length > 0) {
        const result = await postgres.update(
          'profiles',
          { nextcloud_share_links: JSON.stringify(updatedLinks) },
          { id: userId }
        );

        if (!result) {
          throw new Error('Failed to deactivate share links - profile not found');
        }
      }

      console.log('[NextcloudShareManager] Share links deactivated', { userId, count: currentLinks.length });

      return {
        success: true,
        deactivatedCount: currentLinks.length
      };

    } catch (error) {
      console.error('[NextcloudShareManager] Error in deactivateAllShareLinks', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get usage statistics for a user
   */
  static async getUsageStats(userId: string): Promise<UsageStats> {
    try {
      console.log('[NextcloudShareManager] Getting usage stats for user', { userId });

      if (!userId) {
        throw new Error('User ID is required');
      }

      const postgres = await this.getPostgres();

      const profile = await postgres.queryOne(
        'SELECT nextcloud_share_links FROM profiles WHERE id = $1',
        [userId],
        { table: 'profiles' }
      );

      const rawShareLinksStats = profile?.nextcloud_share_links;
      const shareLinks: NextcloudShareLink[] = Array.isArray(rawShareLinksStats) ? rawShareLinksStats : [];

      let stats: UsageStats = {
        totalLinks: shareLinks.length,
        activeLinks: shareLinks.filter((link: NextcloudShareLink) => link.is_active).length,
        inactiveLinks: shareLinks.filter((link: NextcloudShareLink) => !link.is_active).length,
        oldestLink: shareLinks.length > 0 ? new Date(Math.min(...shareLinks.map((link: NextcloudShareLink) => new Date(link.created_at).getTime()))) : null,
        newestLink: shareLinks.length > 0 ? new Date(Math.max(...shareLinks.map((link: NextcloudShareLink) => new Date(link.created_at).getTime()))) : null
      };

      return stats;

    } catch (error) {
      console.error('[NextcloudShareManager] Error in getUsageStats', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Check database state for debugging - shows current nextcloud_share_links for a user
   */
  static async checkDatabaseState(userId: string): Promise<DatabaseStateCheck> {
    try {
      console.log('[NextcloudShareManager] Checking database state for user', { userId });

      if (!userId) {
        throw new Error('User ID is required');
      }

      const postgres = await this.getPostgres();

      const profile = await postgres.queryOne(
        'SELECT id, nextcloud_share_links FROM profiles WHERE id = $1',
        [userId],
        { table: 'profiles' }
      );

      if (!profile) {
        console.log(`[NextcloudShareManager] No profile found for user ${userId}`);
        return {
          profileExists: false,
          userId,
          nextcloud_share_links: null
        };
      }

      console.log(`[NextcloudShareManager] Database state for user ${userId}:`, {
        profileExists: true,
        nextcloud_share_links: profile.nextcloud_share_links || []
      });

      return {
        profileExists: true,
        userId,
        nextcloud_share_links: (profile.nextcloud_share_links as NextcloudShareLink[]) || []
      };

    } catch (error) {
      console.error('[NextcloudShareManager] Error checking database state', { error: (error as Error).message });
      throw error;
    }
  }
}

export default NextcloudShareManager;
