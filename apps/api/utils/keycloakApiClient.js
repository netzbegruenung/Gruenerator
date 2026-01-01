import axios from 'axios';

/**
 * Keycloak API Client for user management operations
 * Uses Keycloak Admin REST API with client credentials flow
 */
class KeycloakApiClient {
  constructor() {
    this.baseUrl = process.env.KEYCLOAK_BASE_URL || 'https://auth.services.moritz-waechter.de';
    this.realm = process.env.KEYCLOAK_REALM || 'Gruenerator';
    
    // Try client credentials first, fallback to admin username/password
    this.clientId = process.env.KEYCLOAK_CLIENT_ID;
    this.clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;
    this.adminUsername = process.env.KEYCLOAK_ADMIN_USERNAME;
    this.adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD;
    this.adminClientId = process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'admin-cli';
    
    if (!this.clientId && !this.adminUsername) {
      console.warn('[KeycloakAPI] Neither client credentials nor admin credentials provided - some operations may fail');
    }

    this.accessToken = null;
    this.tokenExpires = null;
    
    // Create axios client
    this.axiosClient = axios.create({
      baseURL: `${this.baseUrl}/admin/realms/${this.realm}`,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
  }

  /**
   * Get admin access token for API calls using client credentials or username/password
   */
  async getAdminToken() {
    // Check if current token is still valid
    if (this.accessToken && this.tokenExpires && Date.now() < this.tokenExpires) {
      return this.accessToken;
    }

    try {
      console.log('[KeycloakAPI] Requesting new admin token...');
      
      let response;
      
      // Try client credentials flow first
      if (this.clientId && this.clientSecret) {
        console.log('[KeycloakAPI] Attempting client credentials flow...');
        try {
          response = await axios.post(
            `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/token`,
            new URLSearchParams({
              grant_type: 'client_credentials',
              client_id: this.clientId,
              client_secret: this.clientSecret,
            }),
            {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
              }
            }
          );
          console.log('[KeycloakAPI] ✅ Client credentials flow successful');
        } catch (clientError) {
          console.warn('[KeycloakAPI] Client credentials flow failed:', clientError.response?.data || clientError.message);
          
          // Fallback to username/password if available
          if (this.adminUsername && this.adminPassword) {
            console.log('[KeycloakAPI] Falling back to username/password flow...');
            response = await axios.post(
              `${this.baseUrl}/realms/master/protocol/openid-connect/token`,
              new URLSearchParams({
                grant_type: 'password',
                client_id: this.adminClientId,
                username: this.adminUsername,
                password: this.adminPassword,
              }),
              {
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded'
                }
              }
            );
            console.log('[KeycloakAPI] ✅ Username/password flow successful');
          } else {
            throw clientError;
          }
        }
      } else if (this.adminUsername && this.adminPassword) {
        // Only username/password available
        console.log('[KeycloakAPI] Using username/password flow...');
        response = await axios.post(
          `${this.baseUrl}/realms/master/protocol/openid-connect/token`,
          new URLSearchParams({
            grant_type: 'password',
            client_id: this.adminClientId,
            username: this.adminUsername,
            password: this.adminPassword,
          }),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          }
        );
        console.log('[KeycloakAPI] ✅ Username/password flow successful');
      } else {
        throw new Error('No authentication credentials available');
      }

      this.accessToken = response.data.access_token;
      this.tokenExpires = Date.now() + (response.data.expires_in * 1000) - 30000; // 30s buffer
      
      // Update axios client with new token
      this.axiosClient.defaults.headers['Authorization'] = `Bearer ${this.accessToken}`;
      
      console.log('[KeycloakAPI] ✅ Admin token obtained successfully');
      return this.accessToken;
    } catch (error) {
      console.error('[KeycloakAPI] ❌ Failed to get admin token:', error.response?.data || error.message);
      throw new Error(`Failed to authenticate with Keycloak admin API: ${error.message}`);
    }
  }

  /**
   * Ensure we have a valid admin token before making API calls
   */
  async ensureAuth() {
    if (!this.clientId && !this.adminUsername) {
      throw new Error('Keycloak authentication credentials not configured');
    }
    await this.getAdminToken();
  }

  /**
   * Find a user by email
   * @param {string} email The email to search for
   * @returns {Promise<object|null>} The user object if found, otherwise null
   */
  async findUserByEmail(email) {
    try {
      await this.ensureAuth();
      
      console.log(`[KeycloakAPI] Searching for user by email: ${email}`);
      
      const response = await this.axiosClient.get('/users', {
        params: {
          email: email,
          exact: true
        }
      });

      if (response.data && response.data.length > 0) {
        console.log('[KeycloakAPI] User found:', response.data[0].id);
        return response.data[0];
      }

      console.log('[KeycloakAPI] User not found');
      return null;
    } catch (error) {
      console.error('[KeycloakAPI] Error finding user by email:', error.response?.data || error.message);
      if (error.response && error.response.status === 404) {
        return null;
      }
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
      await this.ensureAuth();
      
      console.log(`[KeycloakAPI] Getting user by ID: ${userId}`);
      
      const response = await this.axiosClient.get(`/users/${userId}`);
      return response.data;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return null;
      }
      console.error('[KeycloakAPI] Error getting user by ID:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Create a new user
   * @param {object} userData The user data
   * @param {string} userData.email The user's email
   * @param {string} userData.name The user's full name
   * @param {string} userData.username The username
   * @param {string} userData.password The user's password
   * @param {boolean} [userData.isActive=true] Whether the user is active
   * @returns {Promise<object>} The created user object
   */
  async createUser(userData) {
    try {
      await this.ensureAuth();
      
      const username = userData.username || userData.email;
      console.log(`[KeycloakAPI] Creating user: ${username}`);
      
      const userRequest = {
        email: userData.email,
        username: username,
        firstName: userData.name?.split(' ')[0] || '',
        lastName: userData.name?.split(' ').slice(1).join(' ') || '',
        enabled: userData.isActive !== false,
        emailVerified: true,
        credentials: userData.password ? [{
          type: 'password',
          value: userData.password,
          temporary: false
        }] : []
      };
      
      const response = await this.axiosClient.post('/users', userRequest);
      
      // Get the created user ID from the Location header
      const locationHeader = response.headers.location;
      const userId = locationHeader ? locationHeader.split('/').pop() : null;
      
      if (userId) {
        const createdUser = await this.getUserById(userId);
        console.log('[KeycloakAPI] User created successfully:', createdUser.id);
        return createdUser;
      } else {
        throw new Error('User created but could not retrieve user ID');
      }
    } catch (error) {
      console.error('[KeycloakAPI] Error creating user:', error.response?.data || error.message);
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
      await this.ensureAuth();
      
      console.log(`[KeycloakAPI] Updating user ${userId}:`, updates);
      
      const updateRequest = {};
      
      if (updates.email) updateRequest.email = updates.email;
      if (updates.firstName) updateRequest.firstName = updates.firstName;
      if (updates.lastName) updateRequest.lastName = updates.lastName;
      if (updates.username) updateRequest.username = updates.username;
      if (updates.enabled !== undefined) updateRequest.enabled = updates.enabled;
      
      await this.axiosClient.put(`/users/${userId}`, updateRequest);
      
      // Return updated user
      return await this.getUserById(userId);
    } catch (error) {
      console.error('[KeycloakAPI] Error updating user:', error.response?.data || error.message);
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
      console.log(`[KeycloakAPI] Starting user deletion process for Keycloak ID: ${userId}`);
      
      await this.ensureAuth();
      console.log(`[KeycloakAPI] Authentication successful, proceeding with deletion`);
      
      // First, check if user exists
      try {
        const existingUser = await this.getUserById(userId);
        if (existingUser) {
          console.log(`[KeycloakAPI] User found in Keycloak: ${existingUser.username} (${existingUser.email})`);
        } else {
          console.log(`[KeycloakAPI] User ${userId} not found in Keycloak - may already be deleted`);
          return true; // Consider it successful if user doesn't exist
        }
      } catch (checkError) {
        if (checkError.response?.status === 404) {
          console.log(`[KeycloakAPI] User ${userId} not found in Keycloak (404) - considering deletion successful`);
          return true;
        }
        console.warn(`[KeycloakAPI] Error checking user existence before deletion:`, checkError.message);
        // Continue with deletion attempt anyway
      }
      
      console.log(`[KeycloakAPI] Executing DELETE request to /users/${userId}`);
      const response = await this.axiosClient.delete(`/users/${userId}`);
      
      console.log(`[KeycloakAPI] ✅ Delete request successful. Response status: ${response.status}`);
      console.log(`[KeycloakAPI] User ${userId} deleted successfully from Keycloak`);
      return true;
    } catch (error) {
      console.error(`[KeycloakAPI] ❌ Error deleting user ${userId}:`, error.response?.data || error.message);
      console.error(`[KeycloakAPI] Error details:`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: error.config?.url,
        method: error.config?.method
      });
      
      // If user was already deleted (404), consider it successful
      if (error.response?.status === 404) {
        console.log(`[KeycloakAPI] User ${userId} was already deleted (404) - considering successful`);
        return true;
      }
      
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
      await this.ensureAuth();
      
      console.log(`[KeycloakAPI] Setting password for user: ${userId}`);
      
      await this.axiosClient.put(`/users/${userId}/reset-password`, {
        type: 'password',
        value: password,
        temporary: false
      });
      
      console.log('[KeycloakAPI] Password set successfully');
      return true;
    } catch (error) {
      console.error('[KeycloakAPI] Error setting user password:', error.response?.data || error.message);
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
      const user = await this.findUserByEmail(email);
      if (!user) {
        console.log('[KeycloakAPI] User not found for password reset');
        return false;
      }

      await this.ensureAuth();
      
      console.log(`[KeycloakAPI] Sending password reset email to: ${email}`);
      
      await this.axiosClient.put(`/users/${user.id}/execute-actions-email`, ['UPDATE_PASSWORD']);
      
      console.log('[KeycloakAPI] Password reset email sent successfully');
      return true;
    } catch (error) {
      console.error('[KeycloakAPI] Error sending password reset email:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Check if user belongs to gruenerator source (internal users)
   * @param {object} user The user object
   * @returns {boolean} True if user is from gruenerator source
   */
  isGrueneratorUser(user) {
    if (!user) return false;
    
    // Check if user has any federated identity (external source)
    // If no federated identity, it's a local Keycloak user (gruenerator)
    return !user.federatedIdentities || user.federatedIdentities.length === 0;
  }

  /**
   * Test API connection
   */
  async testConnection() {
    try {
      console.log('[KeycloakAPI] Testing connection...');
      
      await this.ensureAuth();
      
      // Test with a simple realm info request
      const response = await this.axiosClient.get('/');
      
      console.log('[KeycloakAPI] ✅ Connection successful');
      return true;
    } catch (error) {
      console.error('[KeycloakAPI] ❌ Connection test failed:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Get user's federated identities (external providers)
   * @param {string} userId The user ID
   * @returns {Promise<Array>} Array of federated identities
   */
  async getUserFederatedIdentities(userId) {
    try {
      await this.ensureAuth();
      
      const response = await this.axiosClient.get(`/users/${userId}/federated-identity`);
      return response.data;
    } catch (error) {
      console.error('[KeycloakAPI] Error getting federated identities:', error.response?.data || error.message);
      return [];
    }
  }
}

export { KeycloakApiClient };