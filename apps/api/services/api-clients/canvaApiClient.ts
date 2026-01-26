import axios, { AxiosInstance, AxiosError } from 'axios';

/**
 * Canva Connect API Client Service
 *
 * Provides access to Canva's Connect API for design creation, asset management,
 * and user operations.
 *
 * API Documentation: https://www.canva.dev/docs/connect/api-reference/
 */

// Type Definitions
export interface CanvaUser {
  id: string;
  display_name?: string;
  email?: string;
  team_id?: string;
}

export interface CanvaDesign {
  id: string;
  title: string;
  design_type: string;
  urls?: {
    view_url?: string;
    edit_url?: string;
  };
  created_at?: string;
  updated_at?: string;
  template_id?: string;
}

export interface CreateDesignData {
  title: string;
  design_type: string;
  template_id?: string;
  [key: string]: unknown;
}

export interface ListDesignsOptions {
  limit?: number;
  continuation_token?: string;
  [key: string]: unknown;
}

export interface ListDesignsResponse {
  designs: CanvaDesign[];
  has_more: boolean;
  continuation_token: string | null;
}

export interface UploadAssetData {
  name: string;
  parent_folder_id?: string;
  [key: string]: unknown;
}

export interface UploadJob {
  id: string;
  status: 'in_progress' | 'success' | 'failed';
  asset?: {
    id: string;
    name: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

export interface CanvaAsset {
  id: string;
  name: string;
  type: string;
  created_at?: string;
  updated_at?: string;
  thumbnails?: {
    small?: string;
    medium?: string;
    large?: string;
  };
}

export interface ListAssetsOptions {
  limit?: number;
  continuation?: string;
  sort_by?:
    | 'created_descending'
    | 'created_ascending'
    | 'modified_descending'
    | 'modified_ascending';
  [key: string]: unknown;
}

export interface ListAssetsResponse {
  assets: CanvaAsset[];
  has_more: boolean;
  continuation_token: string | null;
}

export interface UploadAssetFromUrlData {
  name: string;
  url: string;
  tags?: string[];
  [key: string]: unknown;
}

class CanvaApiClient {
  private baseURL: string;
  private accessToken: string | null;
  private isConfigured: boolean;
  private client: AxiosInstance;

  constructor(accessToken: string | null = null) {
    this.baseURL = 'https://api.canva.com/rest/v1';
    this.accessToken = accessToken;
    this.isConfigured = !!accessToken;

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Gruenerator/1.0',
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      },
      timeout: 30000, // 30 second timeout for potentially long operations
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
        console.log(
          `[CanvaAPI] ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`
        );
        return response;
      },
      (error) => {
        console.error(`[CanvaAPI] Response error:`, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          message: error.response?.data?.message || error.message,
          url: error.config?.url,
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Check if the API client is properly configured with an access token
   * @returns True if access token is available
   */
  isApiConfigured(): boolean {
    return this.isConfigured;
  }

  /**
   * Validate configuration before making API calls
   * @throws {Error} If API is not configured
   */
  private _validateConfiguration(): void {
    if (!this.isConfigured) {
      throw new Error('Canva API client is not configured with an access token.');
    }
  }

  /**
   * Update the access token for this client instance
   * @param accessToken - New access token
   */
  setAccessToken(accessToken: string | null): void {
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
   * @returns User object with profile information
   */
  async getCurrentUser(): Promise<CanvaUser> {
    this._validateConfiguration();
    try {
      console.log('[CanvaAPI] Fetching current user information');
      const response = await this.client.get<{ user: CanvaUser }>('/users/me');

      if (response.data) {
        console.log('[CanvaAPI] Successfully fetched user info:', response.data.user?.id);
        return response.data.user;
      }

      throw new Error('No user data returned');
    } catch (error) {
      const err = error as AxiosError;
      console.error('[CanvaAPI] Error fetching current user:', err.message);
      throw new Error(`Failed to get user information: ${err.message}`);
    }
  }

  /**
   * Create a new design from a template
   * @param designData - Design creation parameters
   * @returns Created design object
   */
  async createDesign(designData: CreateDesignData): Promise<CanvaDesign> {
    this._validateConfiguration();
    try {
      const { title, design_type, template_id, ...options } = designData;

      console.log(`[CanvaAPI] Creating design: "${title}" (type: ${design_type})`);

      const payload = {
        title,
        design_type,
        ...(template_id && { template_id }),
        ...options,
      };

      const response = await this.client.post<{ design: CanvaDesign }>('/designs', payload);

      if (response.data && response.data.design) {
        console.log('[CanvaAPI] Successfully created design:', response.data.design.id);
        return response.data.design;
      }

      throw new Error('No design data returned');
    } catch (error) {
      const err = error as AxiosError;
      console.error('[CanvaAPI] Error creating design:', err.message);
      throw new Error(`Failed to create design: ${err.message}`);
    }
  }

  /**
   * Get design information by ID
   * @param designId - Design ID
   * @returns Design object
   */
  async getDesign(designId: string): Promise<CanvaDesign> {
    try {
      console.log(`[CanvaAPI] Fetching design: ${designId}`);
      const response = await this.client.get<{ design: CanvaDesign }>(`/designs/${designId}`);

      if (response.data && response.data.design) {
        console.log('[CanvaAPI] Successfully fetched design:', designId);
        return response.data.design;
      }

      throw new Error('Design not found');
    } catch (error) {
      const err = error as AxiosError;
      console.error(`[CanvaAPI] Error fetching design ${designId}:`, err.message);
      throw new Error(`Failed to get design: ${err.message}`);
    }
  }

  /**
   * List user's designs with pagination
   * @param options - Query options (limit, continuation_token, etc.)
   * @returns Object containing designs array and pagination info
   */
  async listDesigns(options: ListDesignsOptions = {}): Promise<ListDesignsResponse> {
    try {
      const { limit = 10, continuation_token, ...filters } = options;

      console.log('[CanvaAPI] Listing designs with options:', { limit, ...filters });

      const params = {
        limit: Math.min(limit, 100), // Cap at 100 per Canva API limits
        ...(continuation_token && { continuation_token }),
        ...filters,
      };

      const response = await this.client.get<{ items?: CanvaDesign[]; continuation?: string }>(
        '/designs',
        { params }
      );

      if (response.data) {
        console.log(`[CanvaAPI] Successfully listed ${response.data.items?.length || 0} designs`);
        return {
          designs: response.data.items || [],
          has_more: !!response.data.continuation,
          continuation_token: response.data.continuation || null,
        };
      }

      return { designs: [], has_more: false, continuation_token: null };
    } catch (error) {
      const err = error as AxiosError;
      console.error('[CanvaAPI] Error listing designs:', err.message);
      throw new Error(`Failed to list designs: ${err.message}`);
    }
  }

  /**
   * Upload an asset to Canva
   * @param assetData - Asset upload parameters
   * @returns Upload job object
   */
  async uploadAsset(assetData: UploadAssetData): Promise<UploadJob> {
    try {
      const { name, parent_folder_id, ...assetOptions } = assetData;

      console.log(`[CanvaAPI] Uploading asset: "${name}"`);

      const payload = {
        name,
        ...(parent_folder_id && { parent_folder_id }),
        ...assetOptions,
      };

      const response = await this.client.post<{ job: UploadJob }>('/asset-uploads', payload);

      if (response.data && response.data.job) {
        console.log('[CanvaAPI] Successfully initiated asset upload:', response.data.job.id);
        return response.data.job;
      }

      throw new Error('No upload job data returned');
    } catch (error) {
      const err = error as AxiosError;
      console.error('[CanvaAPI] Error uploading asset:', err.message);
      throw new Error(`Failed to upload asset: ${err.message}`);
    }
  }

  /**
   * Get upload job status
   * @param jobId - Upload job ID
   * @returns Job status object
   */
  async getUploadJobStatus(jobId: string): Promise<UploadJob> {
    try {
      console.log(`[CanvaAPI] Checking upload job status: ${jobId}`);
      const response = await this.client.get<{ job: UploadJob }>(`/asset-uploads/${jobId}`);

      if (response.data && response.data.job) {
        console.log(`[CanvaAPI] Upload job ${jobId} status: ${response.data.job.status}`);
        return response.data.job;
      }

      throw new Error('Job not found');
    } catch (error) {
      const err = error as AxiosError;
      console.error(`[CanvaAPI] Error checking job ${jobId}:`, err.message);
      throw new Error(`Failed to get job status: ${err.message}`);
    }
  }

  /**
   * List user's assets using folders API
   * @param options - Query options
   * @returns Object containing assets array and pagination info
   */
  async listAssets(options: ListAssetsOptions = {}): Promise<ListAssetsResponse> {
    try {
      const { limit = 10, continuation, sort_by = 'created_descending', ...filters } = options;

      console.log('[CanvaAPI] Listing assets via folders API with options:', {
        limit,
        sort_by,
        ...filters,
      });

      const params = {
        item_types: 'image', // Only get image assets for now
        limit: Math.min(limit, 100),
        sort_by,
        ...(continuation && { continuation }),
        ...filters,
      };

      // Use folders API to list assets from user's root folder
      const response = await this.client.get<{
        items?: Array<{ type: string; image?: CanvaAsset }>;
        continuation?: string;
      }>('/folders/root/items', { params });

      if (response.data && response.data.items) {
        // Extract image assets from the items array
        const assets = response.data.items
          .filter((item) => item.type === 'image' && item.image)
          .map((item) => item.image!);

        console.log(`[CanvaAPI] Successfully listed ${assets.length} assets from folders API`);
        return {
          assets: assets,
          has_more: !!response.data.continuation,
          continuation_token: response.data.continuation || null,
        };
      }

      return { assets: [], has_more: false, continuation_token: null };
    } catch (error) {
      const err = error as AxiosError;
      console.error('[CanvaAPI] Error listing assets via folders API:', err.message);
      throw new Error(`Failed to list assets: ${err.message}`);
    }
  }

  /**
   * Upload an asset from URL to Canva
   * @param assetData - Asset URL upload parameters
   * @returns Upload job object
   */
  async uploadAssetFromUrl(assetData: UploadAssetFromUrlData): Promise<UploadJob> {
    try {
      const { name, url, tags, ...options } = assetData;

      console.log(`[CanvaAPI] Uploading asset from URL: "${name}"`);

      const payload = {
        name,
        url,
        ...(tags && tags.length > 0 && { tags }),
        ...options,
      };

      const response = await this.client.post<{ job: UploadJob }>('/url-asset-uploads', payload);

      if (response.data && response.data.job) {
        console.log('[CanvaAPI] Successfully initiated URL asset upload:', response.data.job.id);
        return response.data.job;
      }

      throw new Error('No upload job data returned');
    } catch (error) {
      const err = error as AxiosError;
      console.error('[CanvaAPI] Error uploading asset from URL:', err.message);
      throw new Error(`Failed to upload asset from URL: ${err.message}`);
    }
  }

  /**
   * Get URL upload job status
   * @param jobId - Upload job ID
   * @returns Job status object
   */
  async getUrlUploadJobStatus(jobId: string): Promise<UploadJob> {
    try {
      console.log(`[CanvaAPI] Checking URL upload job status: ${jobId}`);
      const response = await this.client.get<{ job: UploadJob }>(`/url-asset-uploads/${jobId}`);

      if (response.data && response.data.job) {
        console.log(`[CanvaAPI] URL upload job ${jobId} status: ${response.data.job.status}`);
        return response.data.job;
      }

      throw new Error('Job not found');
    } catch (error) {
      const err = error as AxiosError;
      console.error(`[CanvaAPI] Error checking URL upload job ${jobId}:`, err.message);
      throw new Error(`Failed to get URL upload job status: ${err.message}`);
    }
  }

  /**
   * Get asset information by ID
   * @param assetId - Asset ID
   * @returns Asset object
   */
  async getAsset(assetId: string): Promise<CanvaAsset> {
    try {
      console.log(`[CanvaAPI] Fetching asset: ${assetId}`);
      const response = await this.client.get<{ asset: CanvaAsset }>(`/assets/${assetId}`);

      if (response.data && response.data.asset) {
        console.log('[CanvaAPI] Successfully fetched asset:', assetId);
        return response.data.asset;
      }

      throw new Error('Asset not found');
    } catch (error) {
      const err = error as AxiosError;
      console.error(`[CanvaAPI] Error fetching asset ${assetId}:`, err.message);
      throw new Error(`Failed to get asset: ${err.message}`);
    }
  }

  /**
   * Test API connection and authentication
   * @returns True if connection successful
   */
  async testConnection(): Promise<boolean> {
    if (!this.isConfigured) {
      return false;
    }
    try {
      console.log('[CanvaAPI] Testing API connection...');
      await this.getCurrentUser();

      console.log('[CanvaAPI] Connection test successful');
      return true;
    } catch (error) {
      const err = error as Error;
      console.error('[CanvaAPI] Connection test failed:', err.message);
      return false;
    }
  }

  /**
   * Create a client instance for a specific user's access token
   * @param accessToken - User's Canva access token
   * @returns New client instance
   */
  static forUser(accessToken: string): CanvaApiClient {
    return new CanvaApiClient(accessToken);
  }
}

// Export the class for creating instances
export default CanvaApiClient;
