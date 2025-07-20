const axios = require('axios');
const crypto = require('crypto');
const { supabaseService } = require('./supabaseClient.js');

/**
 * Canva Token Manager
 * 
 * Handles secure storage, retrieval, and refresh of Canva access tokens.
 * Provides encryption/decryption utilities for sensitive token data.
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
      const { data: profile, error } = await supabaseService
        .from('profiles')
        .select('canva_access_token, canva_refresh_token, canva_token_expires_at')
        .eq('id', userId)
        .single();
      
      if (error) {
        console.error('[CanvaTokenManager] Database error:', error);
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
        return this.decrypt(profile.canva_access_token);
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
   * @param {string} encryptedRefreshToken - Encrypted refresh token
   * @returns {Promise<Object|null>} New token data or null if failed
   */
  static async refreshAccessToken(encryptedRefreshToken) {
    try {
      console.log('[CanvaTokenManager] Refreshing access token');
      
      const refreshToken = this.decrypt(encryptedRefreshToken);
      
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
   * Save encrypted tokens to user profile
   * @param {string} userId - User ID
   * @param {Object} tokenData - Token data from Canva
   */
  static async saveTokens(userId, tokenData) {
    try {
      console.log(`[CanvaTokenManager] Saving encrypted tokens for user: ${userId}`);
      
      const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));
      
      const { error } = await supabaseService
        .from('profiles')
        .update({
          canva_access_token: this.encrypt(tokenData.access_token),
          canva_refresh_token: this.encrypt(tokenData.refresh_token),
          canva_token_expires_at: expiresAt.toISOString(),
          canva_scopes: tokenData.scope ? tokenData.scope.split(' ') : []
        })
        .eq('id', userId);
      
      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }
      
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
      
      const { error } = await supabaseService
        .from('profiles')
        .update({
          canva_access_token: null,
          canva_refresh_token: null,
          canva_token_expires_at: null,
          canva_user_id: null,
          canva_display_name: null,
          canva_email: null,
          canva_scopes: null
        })
        .eq('id', userId);
      
      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }
      
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
   * Encrypt a token for secure storage
   * @param {string} token - Token to encrypt
   * @returns {string} Encrypted token or plain token if encryption disabled
   */
  static encrypt(token) {
    try {
      if (!token) return null;
      
      // For basic functionality, allow storing tokens without encryption
      if (!process.env.CANVA_TOKEN_ENCRYPTION_KEY) {
        console.warn('[CanvaTokenManager] No encryption key set - storing tokens without encryption (not recommended for production)');
        return `plain:${token}`;
      }
      
      const algorithm = 'aes-256-gcm';
      const key = this.getEncryptionKey();
      const iv = crypto.randomBytes(16);
      
      const cipher = crypto.createCipherGCM(algorithm, key, iv);
      cipher.setAAD(Buffer.from('canva-token'));
      
      let encrypted = cipher.update(token, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      // Return format: iv:authTag:encrypted
      return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
      
    } catch (error) {
      console.error('[CanvaTokenManager] Encryption error:', error);
      throw new Error('Failed to encrypt token');
    }
  }
  
  /**
   * Decrypt a token from secure storage
   * @param {string} encryptedToken - Encrypted token
   * @returns {string} Decrypted token
   */
  static decrypt(encryptedToken) {
    try {
      if (!encryptedToken) return null;
      
      // Handle plain text tokens (for basic functionality without encryption)
      if (encryptedToken.startsWith('plain:')) {
        return encryptedToken.substring(6); // Remove 'plain:' prefix
      }
      
      const parts = encryptedToken.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted token format');
      }
      
      const [ivHex, authTagHex, encrypted] = parts;
      const algorithm = 'aes-256-gcm';
      const key = this.getEncryptionKey();
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      
      const decipher = crypto.createDecipherGCM(algorithm, key, iv);
      decipher.setAAD(Buffer.from('canva-token'));
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
      
    } catch (error) {
      console.error('[CanvaTokenManager] Decryption error:', error);
      throw new Error('Failed to decrypt token');
    }
  }
  
  /**
   * Get or generate encryption key for token storage
   * @returns {string} Encryption key
   */
  static getEncryptionKey() {
    // Use a combination of environment variables to create a consistent key
    const baseKey = process.env.CANVA_TOKEN_ENCRYPTION_KEY || 
                    process.env.SUPABASE_JWT_SECRET || 
                    'fallback-key-for-development-only';
    
    // Create a 32-byte key using sha256
    return crypto.createHash('sha256').update(baseKey + 'canva-tokens').digest();
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
      console.error('[CanvaTokenManager] Missing required environment variables:', missing);
      return false;
    }
    
    // Warn about optional security features
    if (!process.env.CANVA_TOKEN_ENCRYPTION_KEY) {
      console.warn('[CanvaTokenManager] CANVA_TOKEN_ENCRYPTION_KEY not set - tokens will be stored without encryption (not recommended for production)');
    }
    
    return true;
  }
  
  /**
   * Test token encryption/decryption
   * @returns {boolean} True if encryption works correctly
   */
  static testEncryption() {
    try {
      const testToken = 'test-token-' + Date.now();
      const encrypted = this.encrypt(testToken);
      const decrypted = this.decrypt(encrypted);
      
      const isValid = testToken === decrypted;
      console.log('[CanvaTokenManager] Encryption test:', isValid ? 'PASSED' : 'FAILED');
      return isValid;
      
    } catch (error) {
      console.error('[CanvaTokenManager] Encryption test failed:', error);
      return false;
    }
  }
}

module.exports = CanvaTokenManager;