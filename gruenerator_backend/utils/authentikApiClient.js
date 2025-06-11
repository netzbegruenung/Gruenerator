const axios = require('axios');

/**
 * Authentik API Client with ESM Dynamic Import Support
 * Uses official @goauthentik/api SDK via dynamic import() with axios fallback
 */
class AuthentikApiClient {
  constructor() {
    this.baseUrl = process.env.AUTHENTIK_API_BASE_URL || 'https://auth.services.moritz-waechter.de';
    this.apiToken = process.env.AUTHENTIK_API_TOKEN;
    
    if (!this.apiToken) {
      throw new Error('AUTHENTIK_API_TOKEN environment variable is required');
    }

    // SDK modules (loaded dynamically)
    this.authentikModule = null;
    this.configuration = null;
    this.coreApi = null;
    this.sourcesApi = null;
    
    // Fallback axios client
    this.axiosClient = axios.create({
      baseURL: `${this.baseUrl}/api/v3`,
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    this.sdkAvailable = false;
  }

  /**
   * Initialize the official Authentik SDK using dynamic import()
   */
  async initializeSDK() {
    if (this.authentikModule) {
      return true; // Already initialized
    }

    try {
      console.log('[AuthentikAPI] Initializing official SDK...');
      
      // Dynamic import of ESM module
      this.authentikModule = await import('@goauthentik/api');
      
      // Configure the SDK
      this.configuration = new this.authentikModule.Configuration({
        basePath: `${this.baseUrl}/api/v3`,
        apiKey: this.apiToken,
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        }
      });

      this.coreApi = new this.authentikModule.CoreApi(this.configuration);
      this.sourcesApi = new this.authentikModule.SourcesApi(this.configuration);
      
      this.sdkAvailable = true;
      console.log('[AuthentikAPI] ✅ Official SDK initialized successfully');
      return true;
    } catch (error) {
      console.warn('[AuthentikAPI] ⚠️  Failed to load official SDK, using axios fallback:', error.message);
      this.sdkAvailable = false;
      return false;
    }
  }

  /**
   * Create a built-in authentication source
   */
  async createBuiltInSource(sourceConfig) {
    try {
      console.log('[AuthentikAPI] Creating built-in source:', sourceConfig.name);
      
      if (this.sdkAvailable || await this.initializeSDK()) {
        // Use official SDK
        const sourceData = {
          name: sourceConfig.name,
          slug: sourceConfig.slug,
          enabled: sourceConfig.enabled || true,
          user_matching_mode: sourceConfig.userMatchingMode || 'identifier',
          user_path_template: sourceConfig.userPathTemplate || 'goauthentik.io/sources/%(slug)s',
          ...sourceConfig.additionalSettings
        };

        const response = await this.sourcesApi.sourcesUserCreate({ userSourceRequest: sourceData });
        return response.data;
      } else {
        // Fallback: Axios direct API call
        const sourceData = {
          name: sourceConfig.name,
          slug: sourceConfig.slug,
          enabled: sourceConfig.enabled || true,
          user_matching_mode: sourceConfig.userMatchingMode || 'identifier',
          user_path_template: sourceConfig.userPathTemplate || 'goauthentik.io/sources/%(slug)s',
          ...sourceConfig.additionalSettings
        };

        const response = await this.axiosClient.post('/sources/user/', sourceData);
        return response.data;
      }
    } catch (error) {
      console.error('[AuthentikAPI] Error creating built-in source:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Create a SAML source
   */
  async createSAMLSource(sourceConfig) {
    try {
      console.log('[AuthentikAPI] Creating SAML source:', sourceConfig.name);
      
      if (this.sdkAvailable || await this.initializeSDK()) {
        // Use official SDK
        const sourceData = {
          name: sourceConfig.name,
          slug: sourceConfig.slug,
          enabled: sourceConfig.enabled || false,
          user_matching_mode: sourceConfig.userMatchingMode || 'identifier',
          user_path_template: sourceConfig.userPathTemplate || 'goauthentik.io/sources/%(slug)s',
          sso_url: sourceConfig.ssoUrl || '',
          slo_url: sourceConfig.sloUrl || '',
          issuer: sourceConfig.issuer || '',
          binding_type: sourceConfig.bindingType || 'redirect',
          metadata: sourceConfig.metadata || '',
          ...sourceConfig.additionalSettings
        };

        const response = await this.sourcesApi.sourcesSamlCreate({ saMLSourceRequest: sourceData });
        return response.data;
      } else {
        // Fallback: Axios direct API call
        const sourceData = {
          name: sourceConfig.name,
          slug: sourceConfig.slug,
          enabled: sourceConfig.enabled || false,
          user_matching_mode: sourceConfig.userMatchingMode || 'identifier',
          user_path_template: sourceConfig.userPathTemplate || 'goauthentik.io/sources/%(slug)s',
          sso_url: sourceConfig.ssoUrl || '',
          slo_url: sourceConfig.sloUrl || '',
          issuer: sourceConfig.issuer || '',
          binding_type: sourceConfig.bindingType || 'redirect',
          metadata: sourceConfig.metadata || '',
          ...sourceConfig.additionalSettings
        };

        const response = await this.axiosClient.post('/sources/saml/', sourceData);
        return response.data;
      }
    } catch (error) {
      console.error('[AuthentikAPI] Error creating SAML source:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * List all sources
   */
  async listSources(sourceType = null) {
    try {
      console.log('[AuthentikAPI] Listing sources...');
      
      if (this.sdkAvailable || await this.initializeSDK()) {
        // Use official SDK
        const params = {};
        if (sourceType) {
          params.source_type = sourceType;
        }

        const response = await this.sourcesApi.sourcesAllList(params);
        console.log(`[AuthentikAPI] Found ${response.data.results.length} sources`);
        return response.data.results;
      } else {
        // Fallback: Axios direct API call
        const params = new URLSearchParams();
        if (sourceType) {
          params.append('source_type', sourceType);
        }

        const response = await this.axiosClient.get(`/sources/all/?${params}`);
        console.log(`[AuthentikAPI] Found ${response.data.results.length} sources`);
        return response.data.results;
      }
    } catch (error) {
      console.error('[AuthentikAPI] Error listing sources:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get source by slug
   */
  async getSourceBySlug(slug) {
    try {
      const sources = await this.listSources();
      const source = sources.find(s => s.slug === slug);
      
      if (source) {
        console.log(`[AuthentikAPI] Found source with slug '${slug}':`, source.name);
        return source;
      } else {
        console.log(`[AuthentikAPI] No source found with slug '${slug}'`);
        return null;
      }
    } catch (error) {
      console.error('[AuthentikAPI] Error getting source by slug:', error.message);
      throw error;
    }
  }

  /**
   * Update an existing source
   */
  async updateSource(sourceId, updates) {
    try {
      console.log(`[AuthentikAPI] Updating source ${sourceId}:`, updates);
      
      if (this.sdkAvailable || await this.initializeSDK()) {
        // Use official SDK - determine source type first
        const source = await this.sourcesApi.sourcesAllRetrieve({ slug: sourceId });
        const sourceType = source.data.component;

        let response;
        if (sourceType === 'ak-source-saml') {
          response = await this.sourcesApi.sourcesSamlPartialUpdate({ 
            slug: sourceId, 
            patchedSAMLSourceRequest: updates 
          });
        } else {
          response = await this.sourcesApi.sourcesAllPartialUpdate({ 
            slug: sourceId, 
            patchedSourceRequest: updates 
          });
        }
        return response.data;
      } else {
        // Fallback: Axios direct API call
        const response = await this.axiosClient.patch(`/sources/all/${sourceId}/`, updates);
        return response.data;
      }
    } catch (error) {
      console.error('[AuthentikAPI] Error updating source:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Test API connection
   */
  async testConnection() {
    try {
      console.log('[AuthentikAPI] Testing connection...');
      
      if (this.sdkAvailable || await this.initializeSDK()) {
        // Use official SDK
        const response = await this.coreApi.coreApplicationsList({ limit: 1 });
        console.log('[AuthentikAPI] ✅ Connection successful (SDK)');
        return true;
      } else {
        // Fallback: Axios direct API call
        const response = await this.axiosClient.get('/core/applications/?limit=1');
        console.log('[AuthentikAPI] ✅ Connection successful (Axios)');
        return true;
      }
    } catch (error) {
      console.error('[AuthentikAPI] ❌ Connection test failed:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Find a user by email.
   * @param {string} email The email to search for.
   * @returns {Promise<object|null>} The user object if found, otherwise null.
   */
  async findUserByEmail(email) {
    try {
      console.log(`[AuthentikAPI] Searching for user by email: ${email}`);
      if (this.sdkAvailable || await this.initializeSDK()) {
        const response = await this.coreApi.coreUsersList({ email: email, pageSize: 1 });
        if (response.data.results && response.data.results.length > 0) {
          console.log('[AuthentikAPI] User found:', response.data.results[0]);
          return response.data.results[0];
        }
      } else {
        // Fallback: Axios direct API call
        const response = await this.axiosClient.get(`/core/users/?email=${encodeURIComponent(email)}&page_size=1`);
        if (response.data.results && response.data.results.length > 0) {
          console.log('[AuthentikAPI] User found (Axios):', response.data.results[0]);
          return response.data.results[0];
        }
      }
      console.log('[AuthentikAPI] User not found.');
      return null;
    } catch (error) {
      console.error('[AuthentikAPI] Error finding user by email:', error.response?.data || error.message);
      // Don't throw, just return null if not found due to error that implies not found
      if (error.response && error.response.status === 404) {
        return null;
      }
      // Re-throw for other errors
      throw error;
    }
  }

  /**
   * Create a new user.
   * @param {object} userData The user data.
   * @param {string} userData.email The user's email.
   * @param {string} userData.name The user's full name.
   * @param {string} userData.password The user's password.
   * @param {boolean} [userData.isActive=true] Whether the user is active.
   * @param {string} [userData.path="users"] Default user path.
   * @param {string} [userData.sourceSlug=null] Optional slug of the source to assign the user to, influences the path.
   * @returns {Promise<object>} The created user object.
   */
  async createUser(userData) {
    try {
      const username = userData.username || userData.email; // Default username to email
      console.log(`[AuthentikAPI] Creating user: ${username}`);
      
      let userPath = userData.path || 'users';
      if (userData.sourceSlug) {
        userPath = `goauthentik.io/sources/${userData.sourceSlug}`;
      }

      const userRequestData = {
        username: username,
        email: userData.email,
        name: userData.name,
        is_active: userData.isActive !== undefined ? userData.isActive : true,
        path: userPath, 
        attributes: {}, // Add any custom attributes if needed
      };
      
      let response;

      if (this.sdkAvailable || await this.initializeSDK()) {
         // The SDK might require password to be set in a separate step or flow.
         // For direct user creation with password, UserRequest interface in SDK might be used.
         // Let's assume UserRequest can take password directly, or we might need UserCreationRequest
         const createUserPayload = { ...userRequestData, password: userData.password };
        response = await this.coreApi.coreUsersCreate({ userRequest: createUserPayload });
      } else {
        // Fallback: Axios direct API call
        // The API might have a different structure for password setting
        const createUserPayload = { ...userRequestData, password: userData.password };
        response = await this.axiosClient.post('/core/users/', createUserPayload);
      }
      
      console.log('[AuthentikAPI] User created successfully:', response.data);
      return response.data;

    } catch (error) {
      console.error('[AuthentikAPI] Error creating user:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get current user info
   */
  async getCurrentUser() {
    try {
      if (this.sdkAvailable || await this.initializeSDK()) {
        // Use official SDK
        const response = await this.coreApi.coreUsersMe();
        return response.data;
      } else {
        // Fallback: Axios direct API call
        const response = await this.axiosClient.get('/core/users/me/');
        return response.data;
      }
    } catch (error) {
      console.error('[AuthentikAPI] Error getting current user:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Delete a user by ID
   * @param {string} userId The user ID to delete
   * @returns {Promise<boolean>} True if deletion was successful
   */
  async deleteUser(userId) {
    try {
      console.log(`[AuthentikAPI] Deleting user: ${userId}`);
      
      if (this.sdkAvailable || await this.initializeSDK()) {
        // Use official SDK
        await this.coreApi.coreUsersDestroy({ id: userId });
        console.log('[AuthentikAPI] User deleted successfully (SDK)');
        return true;
      } else {
        // Fallback: Axios direct API call
        await this.axiosClient.delete(`/core/users/${userId}/`);
        console.log('[AuthentikAPI] User deleted successfully (Axios)');
        return true;
      }
    } catch (error) {
      console.error('[AuthentikAPI] Error deleting user:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get user by ID
   * @param {string} userId The user ID
   * @returns {Promise<object|null>} The user object if found
   */
  async getUserById(userId) {
    try {
      console.log(`[AuthentikAPI] Getting user by ID: ${userId}`);
      
      if (this.sdkAvailable || await this.initializeSDK()) {
        const response = await this.coreApi.coreUsersRetrieve({ id: userId });
        return response.data;
      } else {
        // Fallback: Axios direct API call
        const response = await this.axiosClient.get(`/core/users/${userId}/`);
        return response.data;
      }
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return null;
      }
      console.error('[AuthentikAPI] Error getting user by ID:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Update user data
   * @param {string} userId The user ID
   * @param {object} updates The updates to apply
   * @returns {Promise<object>} The updated user object
   */
  async updateUser(userId, updates) {
    try {
      console.log(`[AuthentikAPI] Updating user ${userId}:`, updates);
      
      if (this.sdkAvailable || await this.initializeSDK()) {
        const response = await this.coreApi.coreUsersPartialUpdate({ 
          id: userId, 
          patchedUserRequest: updates 
        });
        return response.data;
      } else {
        // Fallback: Axios direct API call
        const response = await this.axiosClient.patch(`/core/users/${userId}/`, updates);
        return response.data;
      }
    } catch (error) {
      console.error('[AuthentikAPI] Error updating user:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Set user password
   * @param {string} userId The user ID
   * @param {string} password The new password
   * @returns {Promise<boolean>} True if password was set successfully
   */
  async setUserPassword(userId, password) {
    try {
      console.log(`[AuthentikAPI] Setting password for user: ${userId}`);
      
      if (this.sdkAvailable || await this.initializeSDK()) {
        await this.coreApi.coreUsersSetPasswordCreate({ 
          id: userId, 
          userPasswordSetRequest: { password } 
        });
        console.log('[AuthentikAPI] Password set successfully (SDK)');
        return true;
      } else {
        // Fallback: Axios direct API call
        await this.axiosClient.post(`/core/users/${userId}/set_password/`, { password });
        console.log('[AuthentikAPI] Password set successfully (Axios)');
        return true;
      }
    } catch (error) {
      console.error('[AuthentikAPI] Error setting user password:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Send password reset email to user
   * @param {string} email The user's email
   * @returns {Promise<boolean>} True if reset email was sent
   */
  async sendPasswordResetEmail(email) {
    try {
      console.log(`[AuthentikAPI] Sending password reset email to: ${email}`);
      
      // Note: This typically requires a recovery flow to be configured in Authentik
      // For now, we'll return a placeholder implementation
      console.warn('[AuthentikAPI] Password reset email sending not implemented - requires recovery flow configuration');
      return false;
    } catch (error) {
      console.error('[AuthentikAPI] Error sending password reset email:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Create a user via registration flow (enhanced for gruenerator registration)
   * @param {object} userData The user registration data
   * @param {string} userData.email The user's email
   * @param {string} userData.name The user's full name
   * @param {string} userData.password The user's password
   * @param {string} [userData.sourceSlug='gruenerator-login'] The source slug for registration
   * @returns {Promise<object>} The created user object
   */
  async registerUser(userData) {
    try {
      const username = userData.username || userData.email;
      const sourceSlug = userData.sourceSlug || 'gruenerator-login';
      
      console.log(`[AuthentikAPI] Registering user: ${username} via source: ${sourceSlug}`);
      
      // Check if user already exists
      const existingUser = await this.findUserByEmail(userData.email);
      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      // Create user with gruenerator source path
      const userPath = `goauthentik.io/sources/${sourceSlug}`;
      
      const userRequestData = {
        username: username,
        email: userData.email,
        name: userData.name,
        is_active: false, // Start inactive until email verification
        path: userPath,
        attributes: {
          source: sourceSlug,
          registration_source: 'gruenerator'
        }
      };
      
      let response;

      if (this.sdkAvailable || await this.initializeSDK()) {
        const createUserPayload = { ...userRequestData, password: userData.password };
        response = await this.coreApi.coreUsersCreate({ userRequest: createUserPayload });
      } else {
        // Fallback: Axios direct API call
        const createUserPayload = { ...userRequestData, password: userData.password };
        response = await this.axiosClient.post('/core/users/', createUserPayload);
      }
      
      console.log('[AuthentikAPI] User registered successfully:', response.data.email);
      return response.data;

    } catch (error) {
      console.error('[AuthentikAPI] Error registering user:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Activate user account (for email verification flow)
   * @param {string} userId The user ID
   * @returns {Promise<object>} The updated user object
   */
  async activateUser(userId) {
    try {
      console.log(`[AuthentikAPI] Activating user: ${userId}`);
      
      const updates = { is_active: true };
      return await this.updateUser(userId, updates);
    } catch (error) {
      console.error('[AuthentikAPI] Error activating user:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Check if user belongs to gruenerator source
   * @param {object} user The user object
   * @returns {boolean} True if user is from gruenerator source
   */
  isGrueneratorUser(user) {
    if (!user) return false;
    
    // Check if user path contains gruenerator source
    const isGrueneratorPath = user.path && user.path.includes('gruenerator-login');
    
    // Check if user attributes indicate gruenerator registration
    const isGrueneratorAttribute = user.attributes && 
      (user.attributes.source === 'gruenerator-login' || 
       user.attributes.registration_source === 'gruenerator');
    
    return isGrueneratorPath || isGrueneratorAttribute;
  }

  /**
   * Get SDK status for debugging
   */
  getSDKStatus() {
    return {
      sdkAvailable: this.sdkAvailable,
      hasAuthentikModule: !!this.authentikModule,
      hasConfiguration: !!this.configuration,
      fallbackReady: !!this.axiosClient
    };
  }
}

module.exports = { AuthentikApiClient }; 