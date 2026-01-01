import axios from 'axios';

/**
 * Canva Connect API Client Service
 *
 * Provides access to Canva's Connect API for design creation, asset management,
 * and user operations.
 *
 * API Documentation: https://www.canva.dev/docs/connect/api-reference/
 */
class CanvaApiClient {
  constructor(accessToken = null) {
    this.baseURL = 'https://api.canva.com/rest/v1';
    this.accessToken = accessToken;
    this.isConfigured = !!accessToken;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Gruenerator/1.0',
        ...(accessToken && { 'Authorization': `Bearer ${accessToken}` })
      },
      timeout: 30000 // 30 second timeout for potentially long operations
    });

    // Add request interceptor for debugging
    this.client.interceptors.request.use(
      (config) => {
        console.log(`[CanvaAPI] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('[CanvaAPI] Request error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        console.log(`[CanvaAPI] ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`);
        return response;
      },
      (error) => {
        console.error(`[CanvaAPI] Response error:`, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          message: error.response?.data?.message || error.message,
          url: error.config?.url
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Check if the API client is properly configured with an access token
   * @returns {boolean} True if access token is available
   */
  isApiConfigured() {
    return this.isConfigured;
  }

  /**
   * Validate configuration before making API calls
   * @throws {Error} If API is not configured
   */
  _validateConfiguration() {
    if (!this.isConfigured) {
      throw new Error('Canva API client is not configured with an access token.');
    }
  }

  /**
   * Update the access token for this client instance
   * @param {string} accessToken - New access token
   */
  setAccessToken(accessToken) {
    this.accessToken = accessToken;
    this.isConfigured = !!accessToken;
    if (accessToken) {
      this.client.defaults.headers['Authorization'] = `Bearer ${accessToken}`;
    } else {
      delete this.client.defaults.headers['Authorization'];
    }
  }

  /**
   * Get current user information
   * @returns {Promise<Object>} User object with profile information
   */
  async getCurrentUser() {
    this._validateConfiguration();
    try {
      console.log('[CanvaAPI] Fetching current user information');
      const response = await this.client.get('/users/me');
      
      if (response.data) {
        console.log('[CanvaAPI] Successfully fetched user info:', response.data.user?.id);
        return response.data.user;
      }
      
      throw new Error('No user data returned');
    } catch (error) {
      console.error('[CanvaAPI] Error fetching current user:', error.message);
      throw new Error(`Failed to get user information: ${error.message}`);
    }
  }

  /**
   * Create a new design from a template
   * @param {Object} designData - Design creation parameters
   * @returns {Promise<Object>} Created design object
   */
  async createDesign(designData) {
    this._validateConfiguration();
    try {
      const { title, design_type, template_id, ...options } = designData;
      
      console.log(`[CanvaAPI] Creating design: "${title}" (type: ${design_type})`);
      
      const payload = {
        title,
        design_type,
        ...(template_id && { template_id }),
        ...options
      };

      const response = await this.client.post('/designs', payload);
      
      if (response.data && response.data.design) {
        console.log('[CanvaAPI] Successfully created design:', response.data.design.id);
        return response.data.design;
      }
      
      throw new Error('No design data returned');
    } catch (error) {
      console.error('[CanvaAPI] Error creating design:', error.message);
      throw new Error(`Failed to create design: ${error.message}`);
    }
  }

  /**
   * Get design information by ID
   * @param {string} designId - Design ID
   * @returns {Promise<Object>} Design object
   */
  async getDesign(designId) {
    try {
      console.log(`[CanvaAPI] Fetching design: ${designId}`);
      const response = await this.client.get(`/designs/${designId}`);
      
      if (response.data && response.data.design) {
        console.log('[CanvaAPI] Successfully fetched design:', designId);
        return response.data.design;
      }
      
      throw new Error('Design not found');
    } catch (error) {
      console.error(`[CanvaAPI] Error fetching design ${designId}:`, error.message);
      throw new Error(`Failed to get design: ${error.message}`);
    }
  }

  /**
   * List user's designs with pagination
   * @param {Object} options - Query options (limit, continuation_token, etc.)
   * @returns {Promise<Object>} Object containing designs array and pagination info
   */
  async listDesigns(options = {}) {
    try {
      const { limit = 10, continuation_token, ...filters } = options;
      
      console.log('[CanvaAPI] Listing designs with options:', { limit, ...filters });
      
      const params = {
        limit: Math.min(limit, 100), // Cap at 100 per Canva API limits
        ...(continuation_token && { continuation_token }),
        ...filters
      };

      const response = await this.client.get('/designs', { params });
      
      if (response.data) {
        console.log(`[CanvaAPI] Successfully listed ${response.data.items?.length || 0} designs`);
        return {
          designs: response.data.items || [],
          has_more: !!response.data.continuation,
          continuation_token: response.data.continuation || null
        };
      }
      
      return { designs: [], has_more: false, continuation_token: null };
    } catch (error) {
      console.error('[CanvaAPI] Error listing designs:', error.message);
      throw new Error(`Failed to list designs: ${error.message}`);
    }
  }

  /**
   * Upload an asset to Canva
   * @param {Object} assetData - Asset upload parameters
   * @returns {Promise<Object>} Upload job object
   */
  async uploadAsset(assetData) {
    try {
      const { name, parent_folder_id, ...assetOptions } = assetData;
      
      console.log(`[CanvaAPI] Uploading asset: "${name}"`);
      
      const payload = {
        name,
        ...(parent_folder_id && { parent_folder_id }),
        ...assetOptions
      };

      const response = await this.client.post('/asset-uploads', payload);
      
      if (response.data && response.data.job) {
        console.log('[CanvaAPI] Successfully initiated asset upload:', response.data.job.id);
        return response.data.job;
      }
      
      throw new Error('No upload job data returned');
    } catch (error) {
      console.error('[CanvaAPI] Error uploading asset:', error.message);
      throw new Error(`Failed to upload asset: ${error.message}`);
    }
  }

  /**
   * Get upload job status
   * @param {string} jobId - Upload job ID
   * @returns {Promise<Object>} Job status object
   */
  async getUploadJobStatus(jobId) {
    try {
      console.log(`[CanvaAPI] Checking upload job status: ${jobId}`);
      const response = await this.client.get(`/asset-uploads/${jobId}`);
      
      if (response.data && response.data.job) {
        console.log(`[CanvaAPI] Upload job ${jobId} status: ${response.data.job.status}`);
        return response.data.job;
      }
      
      throw new Error('Job not found');
    } catch (error) {
      console.error(`[CanvaAPI] Error checking job ${jobId}:`, error.message);
      throw new Error(`Failed to get job status: ${error.message}`);
    }
  }

  /**
   * List user's assets using folders API
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Object containing assets array and pagination info
   */
  async listAssets(options = {}) {
    try {
      const { limit = 10, continuation, sort_by = 'created_descending', ...filters } = options;
      
      console.log('[CanvaAPI] Listing assets via folders API with options:', { limit, sort_by, ...filters });
      
      const params = {
        item_types: 'image', // Only get image assets for now
        limit: Math.min(limit, 100),
        sort_by,
        ...(continuation && { continuation }),
        ...filters
      };

      // Use folders API to list assets from user's root folder
      const response = await this.client.get('/folders/root/items', { params });
      
      if (response.data && response.data.items) {
        // Extract image assets from the items array
        const assets = response.data.items
          .filter(item => item.type === 'image' && item.image)
          .map(item => item.image);
        
        console.log(`[CanvaAPI] Successfully listed ${assets.length} assets from folders API`);
        return {
          assets: assets,
          has_more: !!response.data.continuation,
          continuation_token: response.data.continuation || null
        };
      }
      
      return { assets: [], has_more: false, continuation_token: null };
    } catch (error) {
      console.error('[CanvaAPI] Error listing assets via folders API:', error.message);
      throw new Error(`Failed to list assets: ${error.message}`);
    }
  }

  /**
   * Upload an asset from URL to Canva
   * @param {Object} assetData - Asset URL upload parameters
   * @returns {Promise<Object>} Upload job object
   */
  async uploadAssetFromUrl(assetData) {
    try {
      const { name, url, tags, ...options } = assetData;
      
      console.log(`[CanvaAPI] Uploading asset from URL: "${name}"`);
      
      const payload = {
        name,
        url,
        ...(tags && tags.length > 0 && { tags }),
        ...options
      };

      const response = await this.client.post('/url-asset-uploads', payload);
      
      if (response.data && response.data.job) {
        console.log('[CanvaAPI] Successfully initiated URL asset upload:', response.data.job.id);
        return response.data.job;
      }
      
      throw new Error('No upload job data returned');
    } catch (error) {
      console.error('[CanvaAPI] Error uploading asset from URL:', error.message);
      throw new Error(`Failed to upload asset from URL: ${error.message}`);
    }
  }

  /**
   * Get URL upload job status
   * @param {string} jobId - Upload job ID
   * @returns {Promise<Object>} Job status object
   */
  async getUrlUploadJobStatus(jobId) {
    try {
      console.log(`[CanvaAPI] Checking URL upload job status: ${jobId}`);
      const response = await this.client.get(`/url-asset-uploads/${jobId}`);
      
      if (response.data && response.data.job) {
        console.log(`[CanvaAPI] URL upload job ${jobId} status: ${response.data.job.status}`);
        return response.data.job;
      }
      
      throw new Error('Job not found');
    } catch (error) {
      console.error(`[CanvaAPI] Error checking URL upload job ${jobId}:`, error.message);
      throw new Error(`Failed to get URL upload job status: ${error.message}`);
    }
  }

  /**
   * Get asset information by ID
   * @param {string} assetId - Asset ID
   * @returns {Promise<Object>} Asset object
   */
  async getAsset(assetId) {
    try {
      console.log(`[CanvaAPI] Fetching asset: ${assetId}`);
      const response = await this.client.get(`/assets/${assetId}`);
      
      if (response.data && response.data.asset) {
        console.log('[CanvaAPI] Successfully fetched asset:', assetId);
        return response.data.asset;
      }
      
      throw new Error('Asset not found');
    } catch (error) {
      console.error(`[CanvaAPI] Error fetching asset ${assetId}:`, error.message);
      throw new Error(`Failed to get asset: ${error.message}`);
    }
  }

  /**
   * Test API connection and authentication
   * @returns {Promise<boolean>} True if connection successful
   */
  async testConnection() {
    if (!this.isConfigured) {
      return false;
    }
    try {
      console.log('[CanvaAPI] Testing API connection...');
      await this.getCurrentUser();
      
      console.log('[CanvaAPI] Connection test successful');
      return true;
    } catch (error) {
      console.error('[CanvaAPI] Connection test failed:', error.message);
      return false;
    }
  }

  /**
   * Create a client instance for a specific user's access token
   * @param {string} accessToken - User's Canva access token
   * @returns {CanvaApiClient} New client instance
   */
  static forUser(accessToken) {
    return new CanvaApiClient(accessToken);
  }
}

// Export the class for creating instances
export default CanvaApiClient;