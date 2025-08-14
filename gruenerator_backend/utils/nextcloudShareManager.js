import pkg from './supabaseClient.js';
const { supabaseService: supabase } = pkg;

export class NextcloudShareManager {
    /**
     * Save a new Nextcloud share link for a user
     */
    static async saveShareLink(userId, shareLink, label = '', baseUrl = '', shareToken = '') {
        try {
            console.log('[NextcloudShareManager] Saving Nextcloud share link', { userId, label });
            
            // Validate inputs
            if (!userId) {
                throw new Error('User ID is required');
            }
            
            if (!shareLink) {
                throw new Error('Share link is required');
            }
            
            // Get current profile to check existing links
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('nextcloud_share_links')
                .eq('id', userId)
                .single();
                
            if (profileError && profileError.code !== 'PGRST116') { // Not "not found" error
                console.error('[NextcloudShareManager] Error getting profile', { error: profileError });
                throw new Error('Failed to get user profile');
            }
            
            const currentLinks = profile?.nextcloud_share_links || [];
            
            // Check if share link already exists
            const existingLink = currentLinks.find(link => link.share_link === shareLink);
            if (existingLink) {
                throw new Error('This share link is already saved');
            }
            
            // Create new link object
            const newLink = {
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
            const { data, error } = await supabase
                .from('profiles')
                .update({ nextcloud_share_links: updatedLinks })
                .eq('id', userId)
                .select()
                .single();
                
            if (error) {
                console.error('[NextcloudShareManager] Error saving share link', { error });
                throw new Error('Failed to save share link: ' + error.message);
            }
            
            console.log('[NextcloudShareManager] Share link saved successfully', { shareLinkId: newLink.id });
            return newLink;
            
        } catch (error) {
            console.error('[NextcloudShareManager] Error in saveShareLink', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Get all share links for a user
     */
    static async getShareLinks(userId) {
        try {
            console.log('[NextcloudShareManager] Getting share links for user', { userId });
            
            if (!userId) {
                throw new Error('User ID is required');
            }
            
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('nextcloud_share_links')
                .eq('id', userId)
                .single();
                
            if (error && error.code !== 'PGRST116') { // Not "not found" error
                console.error('[NextcloudShareManager] Error fetching share links', { error });
                throw new Error('Failed to fetch share links: ' + error.message);
            }
            
            const shareLinks = profile?.nextcloud_share_links || [];
            
            // Sort by created_at descending (newest first)
            const sortedLinks = shareLinks.sort((a, b) => 
                new Date(b.created_at) - new Date(a.created_at)
            );
            
            console.log('[NextcloudShareManager] Retrieved share links', { userId, count: sortedLinks.length });
            return sortedLinks;
            
        } catch (error) {
            console.error('[NextcloudShareManager] Error in getShareLinks', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Get a specific share link by ID
     */
    static async getShareLinkById(userId, shareLinkId) {
        try {
            console.log('[NextcloudShareManager] Getting share link by ID', { userId, shareLinkId });
            
            if (!userId || !shareLinkId) {
                throw new Error('User ID and share link ID are required');
            }
            
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('nextcloud_share_links')
                .eq('id', userId)
                .single();
                
            if (error && error.code !== 'PGRST116') {
                console.error('[NextcloudShareManager] Error fetching share link by ID', { error });
                throw new Error('Failed to fetch share link: ' + error.message);
            }
            
            const shareLinks = profile?.nextcloud_share_links || [];
            const shareLink = shareLinks.find(link => link.id === shareLinkId);
            
            if (!shareLink) {
                throw new Error('Share link not found');
            }
            
            return shareLink;
            
        } catch (error) {
            console.error('[NextcloudShareManager] Error in getShareLinkById', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Update a share link
     */
    static async updateShareLink(userId, shareLinkId, updates) {
        try {
            console.log('[NextcloudShareManager] Updating share link', { userId, shareLinkId, updates });
            
            if (!userId || !shareLinkId) {
                throw new Error('User ID and share link ID are required');
            }
            
            // Get current profile
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('nextcloud_share_links')
                .eq('id', userId)
                .single();
                
            if (profileError && profileError.code !== 'PGRST116') {
                console.error('[NextcloudShareManager] Error getting profile for update', { error: profileError });
                throw new Error('Failed to get user profile');
            }
            
            const currentLinks = profile?.nextcloud_share_links || [];
            const linkIndex = currentLinks.findIndex(link => link.id === shareLinkId);
            
            if (linkIndex === -1) {
                throw new Error('Share link not found or no permission to update');
            }
            
            // Update the link
            const updatedLink = {
                ...currentLinks[linkIndex],
                ...updates,
                updated_at: new Date().toISOString()
            };
            
            // Replace the link in the array
            const updatedLinks = [...currentLinks];
            updatedLinks[linkIndex] = updatedLink;
            
            // Update the profile
            const { data, error } = await supabase
                .from('profiles')
                .update({ nextcloud_share_links: updatedLinks })
                .eq('id', userId)
                .select()
                .single();
                
            if (error) {
                console.error('[NextcloudShareManager] Error updating share link', { error });
                throw new Error('Failed to update share link: ' + error.message);
            }
            
            console.log('[NextcloudShareManager] Share link updated successfully', { shareLinkId: updatedLink.id });
            return updatedLink;
            
        } catch (error) {
            console.error('[NextcloudShareManager] Error in updateShareLink', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Delete a share link
     */
    static async deleteShareLink(userId, shareLinkId) {
        try {
            console.log('[NextcloudShareManager] Deleting share link', { userId, shareLinkId });
            
            if (!userId || !shareLinkId) {
                throw new Error('User ID and share link ID are required');
            }
            
            // Get current profile
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('nextcloud_share_links')
                .eq('id', userId)
                .single();
                
            if (profileError && profileError.code !== 'PGRST116') {
                console.error('[NextcloudShareManager] Error getting profile for deletion', { error: profileError });
                throw new Error('Failed to get user profile');
            }
            
            const currentLinks = profile?.nextcloud_share_links || [];
            const linkToDelete = currentLinks.find(link => link.id === shareLinkId);
            
            if (!linkToDelete) {
                throw new Error('Share link not found or no permission to delete');
            }
            
            // Remove the link from the array
            const updatedLinks = currentLinks.filter(link => link.id !== shareLinkId);
            
            // Update the profile
            const { data, error } = await supabase
                .from('profiles')
                .update({ nextcloud_share_links: updatedLinks })
                .eq('id', userId)
                .select()
                .single();
                
            if (error) {
                console.error('[NextcloudShareManager] Error deleting share link', { error });
                throw new Error('Failed to delete share link: ' + error.message);
            }
            
            console.log('[NextcloudShareManager] Share link deleted successfully', { shareLinkId });
            return { success: true, deletedId: shareLinkId };
            
        } catch (error) {
            console.error('[NextcloudShareManager] Error in deleteShareLink', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Validate share link format
     */
    static validateShareLink(shareLink) {
        try {
            if (!shareLink || typeof shareLink !== 'string') {
                return {
                    isValid: false,
                    error: 'Share link is required and must be a string'
                };
            }
            
            // Check if it's a valid URL
            let urlObj;
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
            console.error('[NextcloudShareManager] Error validating share link', { error: error.message });
            return {
                isValid: false,
                error: 'Validation error: ' + error.message
            };
        }
    }
    
    /**
     * Deactivate all share links for a user (useful for security)
     */
    static async deactivateAllShareLinks(userId) {
        try {
            console.log('[NextcloudShareManager] Deactivating all share links for user', { userId });
            
            if (!userId) {
                throw new Error('User ID is required');
            }
            
            // Get current profile
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('nextcloud_share_links')
                .eq('id', userId)
                .single();
                
            if (profileError && profileError.code !== 'PGRST116') {
                console.error('[NextcloudShareManager] Error getting profile for deactivation', { error: profileError });
                throw new Error('Failed to get user profile');
            }
            
            const currentLinks = profile?.nextcloud_share_links || [];
            
            // Deactivate all links
            const updatedLinks = currentLinks.map(link => ({
                ...link,
                is_active: false,
                updated_at: new Date().toISOString()
            }));
            
            // Update the profile if there were any links to deactivate
            if (currentLinks.length > 0) {
                const { data, error } = await supabase
                    .from('profiles')
                    .update({ nextcloud_share_links: updatedLinks })
                    .eq('id', userId)
                    .select()
                    .single();
                    
                if (error) {
                    console.error('[NextcloudShareManager] Error deactivating share links', { error });
                    throw new Error('Failed to deactivate share links: ' + error.message);
                }
            }
            
            console.log('[NextcloudShareManager] Share links deactivated', { userId, count: currentLinks.length });
            
            return {
                success: true,
                deactivatedCount: currentLinks.length
            };
            
        } catch (error) {
            console.error('[NextcloudShareManager] Error in deactivateAllShareLinks', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Get usage statistics for a user
     */
    static async getUsageStats(userId) {
        try {
            console.log('[NextcloudShareManager] Getting usage stats for user', { userId });
            
            if (!userId) {
                throw new Error('User ID is required');
            }
            
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('nextcloud_share_links')
                .eq('id', userId)
                .single();
                
            if (error && error.code !== 'PGRST116') {
                console.error('[NextcloudShareManager] Error fetching usage stats', { error });
                throw new Error('Failed to fetch usage stats: ' + error.message);
            }
            
            const shareLinks = profile?.nextcloud_share_links || [];
            
            const stats = {
                totalLinks: shareLinks.length,
                activeLinks: shareLinks.filter(link => link.is_active).length,
                inactiveLinks: shareLinks.filter(link => !link.is_active).length,
                oldestLink: shareLinks.length > 0 ? Math.min(...shareLinks.map(link => new Date(link.created_at).getTime())) : null,
                newestLink: shareLinks.length > 0 ? Math.max(...shareLinks.map(link => new Date(link.created_at).getTime())) : null
            };
            
            if (stats.oldestLink) {
                stats.oldestLink = new Date(stats.oldestLink);
            }
            if (stats.newestLink) {
                stats.newestLink = new Date(stats.newestLink);
            }
            
            return stats;
            
        } catch (error) {
            console.error('[NextcloudShareManager] Error in getUsageStats', { error: error.message });
            throw error;
        }
    }
}