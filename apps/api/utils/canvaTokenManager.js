const axios = require('axios');

/**
 * Canva Token Manager
 *
 * Handles storage, retrieval, and refresh of Canva access tokens.
 */
class CanvaTokenManager {
  
  /**
   * Get valid access token for a user, refreshing if necessary
   * @param {string} userId - User ID
   * @returns {Promise<string|null>} Valid access token or null if no connection
   */
  static async getValidAccessToken(userId) {
    try {
      console.log(`[CanvaTokenManager] Getting valid access token for user: ${userId}`);
      
      // Get current tokens from database
      const { getProfileService } = await import('../services/ProfileService.mjs');
      const profileService = getProfileService();
      const profile = await profileService.getProfileById(userId);
      
      if (!profile) {
        console.error('[CanvaTokenManager] Profile not found');
        return null;
      }
      
      if (!profile.canva_access_token || !profile.canva_refresh_token) {
        console.log('[CanvaTokenManager] No Canva tokens found for user');
        return null;
      }
      
      // Check if token is still valid (with 5 minute buffer)
      const expiresAt = new Date(profile.canva_token_expires_at);
      const now = new Date();
      const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
      
      if (expiresAt.getTime() > (now.getTime() + bufferTime)) {
        console.log('[CanvaTokenManager] Access token is still valid');
        return profile.canva_access_token;
      }

      console.log('[CanvaTokenManager] Access token expired, attempting refresh');

      // Token is expired or close to expiry, refresh it
      const refreshedTokens = await this.refreshAccessToken(profile.canva_refresh_token);
      
      if (refreshedTokens) {
        // Save new tokens
        await this.saveTokens(userId, refreshedTokens);
        return refreshedTokens.access_token;
      }
      
      console.warn('[CanvaTokenManager] Failed to refresh token');
      return null;
      
    } catch (error) {
      console.error('[CanvaTokenManager] Error getting valid access token:', error);
      return null;
    }
  }
  
  /**
   * Refresh an access token using a refresh token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<Object|null>} New token data or null if failed
   */
  static async refreshAccessToken(refreshToken) {
    try {
      console.log('[CanvaTokenManager] Refreshing access token');
      
      const credentials = Buffer.from(`${process.env.CANVA_CLIENT_ID}:${process.env.CANVA_CLIENT_SECRET}`).toString('base64');
      
      // Prepare form data as required by OAuth 2.0 specification
      const formData = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      });

      const response = await axios.post('https://api.canva.com/rest/v1/oauth/token', formData, {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000
      });
      
      console.log('[CanvaTokenManager] Token refresh successful');
      return response.data;
      
    } catch (error) {
      console.error('[CanvaTokenManager] Token refresh failed:', error.response?.data || error.message);
      
      // If refresh fails with 400/401, the refresh token is likely invalid
      if (error.response?.status === 400 || error.response?.status === 401) {
        console.warn('[CanvaTokenManager] Refresh token is invalid, user needs to re-authenticate');
      }
      
      return null;
    }
  }
  
  /**
   * Save tokens to user profile
   * @param {string} userId - User ID
   * @param {Object} tokenData - Token data from Canva
   */
  static async saveTokens(userId, tokenData) {
    try {
      console.log(`[CanvaTokenManager] Saving tokens for user: ${userId}`);

      const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));

      const { getProfileService } = await import('../services/ProfileService.mjs');
      const profileService = getProfileService();
      await profileService.updateProfile(userId, {
        canva_access_token: tokenData.access_token,
        canva_refresh_token: tokenData.refresh_token,
        canva_token_expires_at: expiresAt.toISOString(),
        canva_scopes: tokenData.scope ? tokenData.scope.split(' ') : []
      });

      console.log(`[CanvaTokenManager] Tokens saved successfully for user: ${userId}`);
      
    } catch (error) {
      console.error('[CanvaTokenManager] Error saving tokens:', error);
      throw error;
    }
  }
  
  /**
   * Clear all Canva tokens for a user
   * @param {string} userId - User ID
   */
  static async clearTokens(userId) {
    try {
      console.log(`[CanvaTokenManager] Clearing tokens for user: ${userId}`);
      
      const { getProfileService } = await import('../services/ProfileService.mjs');
      const profileService = getProfileService();
      await profileService.updateProfile(userId, {
        canva_access_token: null,
        canva_refresh_token: null,
        canva_token_expires_at: null,
        canva_user_id: null,
        canva_display_name: null,
        canva_email: null,
        canva_scopes: null
      });
      
      console.log(`[CanvaTokenManager] Tokens cleared successfully for user: ${userId}`);
      
    } catch (error) {
      console.error('[CanvaTokenManager] Error clearing tokens:', error);
      throw error;
    }
  }
  
  /**
   * Check if user has valid Canva connection
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} True if user has valid connection
   */
  static async hasValidConnection(userId) {
    try {
      const accessToken = await this.getValidAccessToken(userId);
      return !!accessToken;
    } catch (error) {
      console.error('[CanvaTokenManager] Error checking connection:', error);
      return false;
    }
  }
  
  /**
   * Validate that required environment variables are set
   * @returns {boolean} True if configuration is valid
   */
  static validateConfiguration() {
    const required = [
      'CANVA_CLIENT_ID',
      'CANVA_CLIENT_SECRET',
      'CANVA_REDIRECT_URI'
    ];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
      console.warn('[CanvaTokenManager] Missing required environment variables:', missing, '- Canva API features will be disabled');
      return false;
    }

    return true;
  }
}

module.exports = CanvaTokenManager;
