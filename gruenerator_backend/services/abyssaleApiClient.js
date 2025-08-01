const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * Abyssale API Client Service
 * 
 * Provides access to Abyssale's REST API for automated image generation,
 * template management, and project operations. Follows the established pattern
 * from other API clients in the project.
 * 
 * API Documentation: https://api.abyssale.com
 */
class AbyssaleApiClient {
  constructor(apiKey = null) {
    this.baseURL = 'https://api.abyssale.com';
    this.apiKey = apiKey || process.env.ABYSSALE_API_KEY;
    this.isConfigured = !!this.apiKey;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Gruenerator/1.0',
        ...(this.apiKey && { 'x-api-key': this.apiKey })
      },
      timeout: 30000 // 30 second timeout for potentially long operations
    });

    // Add request interceptor for debugging
    this.client.interceptors.request.use(
      (config) => {
        console.log(`[AbyssaleAPI] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('[AbyssaleAPI] Request error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        console.log(`[AbyssaleAPI] ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`);
        return response;
      },
      (error) => {
        console.error(`[AbyssaleAPI] Response error:`, {
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
   * Check if the API client is properly configured with an API key
   * @returns {boolean} True if API key is available
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
      throw new Error('Abyssale API client is not configured with an API key.');
    }
  }

  /**
   * Update the API key for this client instance
   * @param {string} apiKey - New API key
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey;
    this.isConfigured = !!apiKey;
    if (apiKey) {
      this.client.defaults.headers['x-api-key'] = apiKey;
    } else {
      delete this.client.defaults.headers['x-api-key'];
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
      console.log('[AbyssaleAPI] Testing API connection...');
      await this.client.get('/ready');
      
      console.log('[AbyssaleAPI] Connection test successful');
      return true;
    } catch (error) {
      console.error('[AbyssaleAPI] Connection test failed:', error.message);
      return false;
    }
  }

  /**
   * Get all available designs/templates
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of design objects
   */
  async getDesigns(options = {}) {
    this._validateConfiguration();
    try {
      const { category_id, type, ...filters } = options;
      
      console.log('[AbyssaleAPI] Fetching designs with options:', { category_id, type, ...filters });
      
      const params = {
        ...(category_id && { category_id }),
        ...(type && { type }),
        ...filters
      };

      const response = await this.client.get('/designs', { params });
      
      if (response.data && Array.isArray(response.data)) {
        console.log(`[AbyssaleAPI] Successfully fetched ${response.data.length} designs`);
        return response.data;
      }
      
      return [];
    } catch (error) {
      console.error('[AbyssaleAPI] Error fetching designs:', error.message);
      throw new Error(`Failed to get designs: ${error.message}`);
    }
  }

  /**
   * Get design details by ID
   * @param {string} designId - Design UUID
   * @returns {Promise<Object>} Design object with formats and elements
   */
  async getDesignDetails(designId) {
    this._validateConfiguration();
    try {
      console.log(`[AbyssaleAPI] Fetching design details: ${designId}`);
      const response = await this.client.get(`/designs/${designId}`);
      
      if (response.data) {
        console.log('[AbyssaleAPI] Successfully fetched design details:', designId);
        return response.data;
      }
      
      throw new Error('Design not found');
    } catch (error) {
      console.error(`[AbyssaleAPI] Error fetching design ${designId}:`, error.message);
      throw new Error(`Failed to get design details: ${error.message}`);
    }
  }

  /**
   * Generate a single image from a design
   * @param {string} designId - Design UUID
   * @param {Object} generateData - Generation parameters
   * @returns {Promise<Object>} Generated image object
   */
  async generateImage(designId, generateData) {
    this._validateConfiguration();
    try {
      const { elements, template_format_name, file_compression_level = 80, ...options } = generateData;
      
      console.log(`[AbyssaleAPI] Generating image for design: ${designId}`);
      
      const payload = {
        elements: elements || {},
        ...(template_format_name && { template_format_name }),
        file_compression_level,
        ...options
      };

      const response = await this.client.post(`/banner-builder/${designId}/generate`, payload);
      
      if (response.data) {
        console.log('[AbyssaleAPI] Successfully generated image:', response.data.id);
        return response.data;
      }
      
      throw new Error('No image data returned');
    } catch (error) {
      console.error('[AbyssaleAPI] Error generating image:', error.message);
      throw new Error(`Failed to generate image: ${error.message}`);
    }
  }

  /**
   * Generate multiple format images/videos/PDFs asynchronously
   * @param {string} designId - Design UUID
   * @param {Object} generateData - Generation parameters
   * @returns {Promise<Object>} Generation request object with ID
   */
  async generateMultiFormatImages(designId, generateData) {
    this._validateConfiguration();
    try {
      const { elements, template_format_names, callback_url, ...options } = generateData;
      
      console.log(`[AbyssaleAPI] Generating multi-format images for design: ${designId}`);
      
      const payload = {
        elements: elements || {},
        ...(template_format_names && { template_format_names }),
        ...(callback_url && { callback_url }),
        ...options
      };

      const response = await this.client.post(`/async/banner-builder/${designId}/generate`, payload);
      
      if (response.data && response.data.generation_request_id) {
        console.log('[AbyssaleAPI] Successfully initiated multi-format generation:', response.data.generation_request_id);
        return response.data;
      }
      
      throw new Error('No generation request ID returned');
    } catch (error) {
      console.error('[AbyssaleAPI] Error generating multi-format images:', error.message);
      throw new Error(`Failed to generate multi-format images: ${error.message}`);
    }
  }

  /**
   * Generate multi-page PDF
   * @param {string} designId - Design UUID
   * @param {Object} generateData - PDF generation parameters
   * @returns {Promise<Object>} Generation request object with ID
   */
  async generateMultiPagePdf(designId, generateData) {
    this._validateConfiguration();
    try {
      const { pages, callback_url, ...options } = generateData;
      
      console.log(`[AbyssaleAPI] Generating multi-page PDF for design: ${designId}`);
      
      const payload = {
        pages: pages || {},
        ...(callback_url && { callback_url }),
        ...options
      };

      const response = await this.client.post(`/async/banner-builder/${designId}/generate‎`, payload);
      
      if (response.data && response.data.generation_request_id) {
        console.log('[AbyssaleAPI] Successfully initiated PDF generation:', response.data.generation_request_id);
        return response.data;
      }
      
      throw new Error('No PDF generation request ID returned');
    } catch (error) {
      console.error('[AbyssaleAPI] Error generating multi-page PDF:', error.message);
      throw new Error(`Failed to generate multi-page PDF: ${error.message}`);
    }
  }

  /**
   * Get file information by banner ID
   * @param {string} bannerId - Banner/file UUID
   * @returns {Promise<Object>} File object with URL and metadata
   */
  async getFile(bannerId) {
    this._validateConfiguration();
    try {
      console.log(`[AbyssaleAPI] Fetching file: ${bannerId}`);
      const response = await this.client.get(`/banners/${bannerId}`);
      
      if (response.data) {
        console.log('[AbyssaleAPI] Successfully fetched file:', bannerId);
        return response.data;
      }
      
      throw new Error('File not found');
    } catch (error) {
      console.error(`[AbyssaleAPI] Error fetching file ${bannerId}:`, error.message);
      throw new Error(`Failed to get file: ${error.message}`);
    }
  }

  /**
   * Get all available fonts
   * @returns {Promise<Array>} Array of font objects
   */
  async getFonts() {
    this._validateConfiguration();
    try {
      console.log('[AbyssaleAPI] Fetching available fonts');
      const response = await this.client.get('/fonts');
      
      if (response.data && Array.isArray(response.data)) {
        console.log(`[AbyssaleAPI] Successfully fetched ${response.data.length} fonts`);
        return response.data;
      }
      
      return [];
    } catch (error) {
      console.error('[AbyssaleAPI] Error fetching fonts:', error.message);
      throw new Error(`Failed to get fonts: ${error.message}`);
    }
  }

  /**
   * Create a banner export (ZIP file)
   * @param {Object} exportData - Export parameters
   * @returns {Promise<Object>} Export request object with ID
   */
  async createBannerExport(exportData) {
    this._validateConfiguration();
    try {
      const { ids, callback_url } = exportData;
      
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        throw new Error('Export requires at least one banner ID');
      }
      
      console.log(`[AbyssaleAPI] Creating banner export for ${ids.length} banners`);
      
      const payload = {
        ids,
        ...(callback_url && { callback_url })
      };

      const response = await this.client.post('/async/banners/export', payload);
      
      if (response.data && response.data.export_id) {
        console.log('[AbyssaleAPI] Successfully created banner export:', response.data.export_id);
        return response.data;
      }
      
      throw new Error('No export ID returned');
    } catch (error) {
      console.error('[AbyssaleAPI] Error creating banner export:', error.message);
      throw new Error(`Failed to create banner export: ${error.message}`);
    }
  }

  /**
   * Get all projects
   * @returns {Promise<Array>} Array of project objects
   */
  async getProjects() {
    this._validateConfiguration();
    try {
      console.log('[AbyssaleAPI] Fetching projects');
      const response = await this.client.get('/projects');
      
      if (response.data && Array.isArray(response.data)) {
        console.log(`[AbyssaleAPI] Successfully fetched ${response.data.length} projects`);
        return response.data;
      }
      
      return [];
    } catch (error) {
      console.error('[AbyssaleAPI] Error fetching projects:', error.message);
      throw new Error(`Failed to get projects: ${error.message}`);
    }
  }

  /**
   * Create a new project
   * @param {Object} projectData - Project creation parameters
   * @returns {Promise<Object>} Created project object
   */
  async createProject(projectData) {
    this._validateConfiguration();
    try {
      const { name, ...options } = projectData;
      
      if (!name || name.length < 2 || name.length > 100) {
        throw new Error('Project name must be between 2 and 100 characters');
      }
      
      console.log(`[AbyssaleAPI] Creating project: "${name}"`);
      
      const payload = {
        name,
        ...options
      };

      const response = await this.client.post('/projects', payload);
      
      if (response.data) {
        console.log('[AbyssaleAPI] Successfully created project:', response.data.id);
        return response.data;
      }
      
      throw new Error('No project data returned');
    } catch (error) {
      console.error('[AbyssaleAPI] Error creating project:', error.message);
      throw new Error(`Failed to create project: ${error.message}`);
    }
  }

  /**
   * Duplicate a workspace template into a project
   * @param {string} companyTemplateId - Workspace template UUID
   * @param {Object} duplicateData - Duplication parameters
   * @returns {Promise<Object>} Duplication request object
   */
  async duplicateWorkspaceTemplate(companyTemplateId, duplicateData) {
    this._validateConfiguration();
    try {
      const { project_id, name, ...options } = duplicateData;
      
      if (!project_id) {
        throw new Error('Project ID is required for template duplication');
      }
      
      console.log(`[AbyssaleAPI] Duplicating workspace template: ${companyTemplateId} to project: ${project_id}`);
      
      const payload = {
        project_id,
        ...(name && { name }),
        ...options
      };

      const response = await this.client.post(`/workspace-templates/${companyTemplateId}/use`, payload);
      
      if (response.data && response.data.duplication_request_id) {
        console.log('[AbyssaleAPI] Successfully initiated template duplication:', response.data.duplication_request_id);
        return response.data;
      }
      
      throw new Error('No duplication request ID returned');
    } catch (error) {
      console.error('[AbyssaleAPI] Error duplicating workspace template:', error.message);
      throw new Error(`Failed to duplicate workspace template: ${error.message}`);
    }
  }

  /**
   * Get duplication request status
   * @param {string} duplicateRequestId - Duplication request UUID
   * @returns {Promise<Object>} Duplication status object
   */
  async getDuplicationRequestStatus(duplicateRequestId) {
    this._validateConfiguration();
    try {
      console.log(`[AbyssaleAPI] Checking duplication request status: ${duplicateRequestId}`);
      const response = await this.client.get(`/design-duplication-requests/${duplicateRequestId}`);
      
      if (response.data) {
        console.log(`[AbyssaleAPI] Duplication request ${duplicateRequestId} status: ${response.data.status}`);
        return response.data;
      }
      
      throw new Error('Duplication request not found');
    } catch (error) {
      console.error(`[AbyssaleAPI] Error checking duplication request ${duplicateRequestId}:`, error.message);
      throw new Error(`Failed to get duplication request status: ${error.message}`);
    }
  }

  /**
   * Download and save generated image locally
   * @param {string} imageUrl - URL of the generated image from Abyssale
   * @param {string} bannerId - Banner ID for file naming
   * @param {string} fileType - File extension (jpeg, png, etc.)
   * @returns {Promise<Object>} Local file information
   */
  async downloadAndSaveImage(imageUrl, bannerId, fileType = 'jpeg') {
    try {
      console.log(`[AbyssaleAPI] Downloading image: ${bannerId}`);
      
      // Create directory structure
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const uploadDir = path.join(process.cwd(), 'uploads', 'abyssale', today);
      
      // Ensure directory exists
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
        console.log(`[AbyssaleAPI] Created directory: ${uploadDir}`);
      }
      
      // Download image
      const response = await axios({
        method: 'GET',
        url: imageUrl,
        responseType: 'stream',
        timeout: 30000
      });
      
      // Generate filename
      const filename = `${bannerId}.${fileType}`;
      const filePath = path.join(uploadDir, filename);
      const relativePath = path.join('uploads', 'abyssale', today, filename);
      
      // Save image to disk
      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);
      
      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          const stats = fs.statSync(filePath);
          console.log(`[AbyssaleAPI] Image saved: ${filename} (${stats.size} bytes)`);
          
          resolve({
            path: filePath,
            relativePath: relativePath,
            filename: filename,
            size: stats.size,
            url: `/api/abyssale/images/${bannerId}`,
            savedAt: new Date().toISOString()
          });
        });
        
        writer.on('error', (error) => {
          console.error(`[AbyssaleAPI] Error saving image ${bannerId}:`, error);
          reject(new Error(`Failed to save image: ${error.message}`));
        });
      });
      
    } catch (error) {
      console.error(`[AbyssaleAPI] Error downloading image ${bannerId}:`, error.message);
      throw new Error(`Failed to download image: ${error.message}`);
    }
  }

  /**
   * Generate image and automatically download it locally
   * @param {string} designId - Design UUID
   * @param {Object} generateData - Generation parameters
   * @param {boolean} downloadLocal - Whether to download image locally (default: true)
   * @returns {Promise<Object>} Enhanced result with both Abyssale data and local file info
   */
  async generateImageWithDownload(designId, generateData, downloadLocal = true) {
    try {
      // Generate image via Abyssale API
      const abyssaleResult = await this.generateImage(designId, generateData);
      
      const result = {
        success: true,
        abyssale: abyssaleResult,
        local: null
      };
      
      // Download image locally if requested
      if (downloadLocal && abyssaleResult.file?.url) {
        try {
          const localFile = await this.downloadAndSaveImage(
            abyssaleResult.file.url,
            abyssaleResult.id,
            abyssaleResult.file.type
          );
          result.local = localFile;
          console.log(`[AbyssaleAPI] Image generated and saved locally: ${localFile.filename}`);
        } catch (downloadError) {
          console.error(`[AbyssaleAPI] Image generated but download failed:`, downloadError.message);
          // Don't fail the whole request if download fails
          result.local = { error: downloadError.message };
        }
      }
      
      return result;
    } catch (error) {
      console.error('[AbyssaleAPI] Error in generateImageWithDownload:', error.message);
      throw error;
    }
  }

  /**
   * Create a client instance with a specific API key
   * @param {string} apiKey - Abyssale API key
   * @returns {AbyssaleApiClient} New client instance
   */
  static withApiKey(apiKey) {
    return new AbyssaleApiClient(apiKey);
  }
}

// Export the class for creating instances
module.exports = AbyssaleApiClient;