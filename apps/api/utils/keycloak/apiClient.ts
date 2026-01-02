/**
 * Keycloak API Client for user management operations
 * Uses Keycloak Admin REST API with client credentials flow
 */

import axios, { type AxiosInstance, type AxiosResponse } from 'axios';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Keycloak user representation
 */
export interface KeycloakUser {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
  emailVerified: boolean;
  federatedIdentities?: FederatedIdentity[];
  attributes?: Record<string, string[]>;
  createdTimestamp?: number;
}

/**
 * Federated identity provider information
 */
export interface FederatedIdentity {
  identityProvider: string;
  userId: string;
  userName: string;
}

/**
 * User credential for password
 */
export interface UserCredential {
  type: 'password';
  value: string;
  temporary: boolean;
}

/**
 * User creation data
 */
export interface CreateUserData {
  email: string;
  name?: string;
  username?: string;
  password?: string;
  isActive?: boolean;
}

/**
 * User update data
 */
export interface UpdateUserData {
  email?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  enabled?: boolean;
}

/**
 * Token response from Keycloak
 */
interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: string;
}

// ============================================================================
// Keycloak API Client Class
// ============================================================================

/**
 * Keycloak API Client for user management operations
 */
export class KeycloakApiClient {
  private baseUrl: string;
  private realm: string;
  private clientId?: string;
  private clientSecret?: string;
  private adminUsername?: string;
  private adminPassword?: string;
  private adminClientId: string;
  private accessToken: string | null = null;
  private tokenExpires: number | null = null;
  private axiosClient: AxiosInstance;

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
      console.warn(
        '[KeycloakAPI] Neither client credentials nor admin credentials provided - some operations may fail'
      );
    }

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
  async getAdminToken(): Promise<string> {
    // Check if current token is still valid
    if (this.accessToken && this.tokenExpires && Date.now() < this.tokenExpires) {
      return this.accessToken;
    }

    try {
      console.log('[KeycloakAPI] Requesting new admin token...');

      let response: AxiosResponse<TokenResponse>;

      // Try client credentials flow first
      if (this.clientId && this.clientSecret) {
        console.log('[KeycloakAPI] Attempting client credentials flow...');
        try {
          response = await axios.post(
            `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/token`,
            new URLSearchParams({
              grant_type: 'client_credentials',
              client_id: this.clientId,
              client_secret: this.clientSecret
            }),
            {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
              }
            }
          );
          console.log('[KeycloakAPI] ✅ Client credentials flow successful');
        } catch (clientError: any) {
          console.warn(
            '[KeycloakAPI] Client credentials flow failed:',
            clientError.response?.data || clientError.message
          );

          // Fallback to username/password if available
          if (this.adminUsername && this.adminPassword) {
            console.log('[KeycloakAPI] Falling back to username/password flow...');
            response = await axios.post(
              `${this.baseUrl}/realms/master/protocol/openid-connect/token`,
              new URLSearchParams({
                grant_type: 'password',
                client_id: this.adminClientId,
                username: this.adminUsername,
                password: this.adminPassword
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
            password: this.adminPassword
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
      this.tokenExpires = Date.now() + response.data.expires_in * 1000 - 30000; // 30s buffer

      // Update axios client with new token
      this.axiosClient.defaults.headers['Authorization'] = `Bearer ${this.accessToken}`;

      console.log('[KeycloakAPI] ✅ Admin token obtained successfully');
      return this.accessToken;
    } catch (error: any) {
      console.error(
        '[KeycloakAPI] ❌ Failed to get admin token:',
        error.response?.data || error.message
      );
      throw new Error(`Failed to authenticate with Keycloak admin API: ${error.message}`);
    }
  }

  /**
   * Ensure we have a valid admin token before making API calls
   */
  async ensureAuth(): Promise<void> {
    if (!this.clientId && !this.adminUsername) {
      throw new Error('Keycloak authentication credentials not configured');
    }
    await this.getAdminToken();
  }

  /**
   * Find a user by email
   * @param email - The email to search for
   * @returns The user object if found, otherwise null
   */
  async findUserByEmail(email: string): Promise<KeycloakUser | null> {
    try {
      await this.ensureAuth();

      console.log(`[KeycloakAPI] Searching for user by email: ${email}`);

      const response = await this.axiosClient.get<KeycloakUser[]>('/users', {
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
    } catch (error: any) {
      console.error(
        '[KeycloakAPI] Error finding user by email:',
        error.response?.data || error.message
      );
      if (error.response && error.response.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get user by ID
   * @param userId - The user ID
   * @returns The user object if found
   */
  async getUserById(userId: string): Promise<KeycloakUser | null> {
    try {
      await this.ensureAuth();

      console.log(`[KeycloakAPI] Getting user by ID: ${userId}`);

      const response = await this.axiosClient.get<KeycloakUser>(`/users/${userId}`);
      return response.data;
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        return null;
      }
      console.error('[KeycloakAPI] Error getting user by ID:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Create a new user
   * @param userData - The user data
   * @returns The created user object
   */
  async createUser(userData: CreateUserData): Promise<KeycloakUser> {
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
        credentials: userData.password
          ? [
              {
                type: 'password' as const,
                value: userData.password,
                temporary: false
              }
            ]
          : []
      };

      const response = await this.axiosClient.post('/users', userRequest);

      // Get the created user ID from the Location header
      const locationHeader = response.headers.location;
      const userId = locationHeader ? locationHeader.split('/').pop() : null;

      if (userId) {
        const createdUser = await this.getUserById(userId);
        if (createdUser) {
          console.log('[KeycloakAPI] User created successfully:', createdUser.id);
          return createdUser;
        }
        throw new Error('User created but could not retrieve user data');
      } else {
        throw new Error('User created but could not retrieve user ID');
      }
    } catch (error: any) {
      console.error('[KeycloakAPI] Error creating user:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Update user data
   * @param userId - The user ID
   * @param updates - The updates to apply
   * @returns The updated user object
   */
  async updateUser(userId: string, updates: UpdateUserData): Promise<KeycloakUser | null> {
    try {
      await this.ensureAuth();

      console.log(`[KeycloakAPI] Updating user ${userId}:`, updates);

      const updateRequest: Partial<KeycloakUser> = {};

      if (updates.email) updateRequest.email = updates.email;
      if (updates.firstName) updateRequest.firstName = updates.firstName;
      if (updates.lastName) updateRequest.lastName = updates.lastName;
      if (updates.username) updateRequest.username = updates.username;
      if (updates.enabled !== undefined) updateRequest.enabled = updates.enabled;

      await this.axiosClient.put(`/users/${userId}`, updateRequest);

      // Return updated user
      return await this.getUserById(userId);
    } catch (error: any) {
      console.error('[KeycloakAPI] Error updating user:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Delete a user by ID
   * @param userId - The user ID to delete
   * @returns True if deletion was successful
   */
  async deleteUser(userId: string): Promise<boolean> {
    try {
      console.log(`[KeycloakAPI] Starting user deletion process for Keycloak ID: ${userId}`);

      await this.ensureAuth();
      console.log(`[KeycloakAPI] Authentication successful, proceeding with deletion`);

      // First, check if user exists
      try {
        const existingUser = await this.getUserById(userId);
        if (existingUser) {
          console.log(
            `[KeycloakAPI] User found in Keycloak: ${existingUser.username} (${existingUser.email})`
          );
        } else {
          console.log(
            `[KeycloakAPI] User ${userId} not found in Keycloak - may already be deleted`
          );
          return true; // Consider it successful if user doesn't exist
        }
      } catch (checkError: any) {
        if (checkError.response?.status === 404) {
          console.log(
            `[KeycloakAPI] User ${userId} not found in Keycloak (404) - considering deletion successful`
          );
          return true;
        }
        console.warn(
          `[KeycloakAPI] Error checking user existence before deletion:`,
          checkError.message
        );
        // Continue with deletion attempt anyway
      }

      console.log(`[KeycloakAPI] Executing DELETE request to /users/${userId}`);
      const response = await this.axiosClient.delete(`/users/${userId}`);

      console.log(`[KeycloakAPI] ✅ Delete request successful. Response status: ${response.status}`);
      console.log(`[KeycloakAPI] User ${userId} deleted successfully from Keycloak`);
      return true;
    } catch (error: any) {
      console.error(
        `[KeycloakAPI] ❌ Error deleting user ${userId}:`,
        error.response?.data || error.message
      );
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
   * @param userId - The user ID
   * @param password - The new password
   * @returns True if password was set successfully
   */
  async setUserPassword(userId: string, password: string): Promise<boolean> {
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
    } catch (error: any) {
      console.error('[KeycloakAPI] Error setting user password:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Send password reset email to user
   * @param email - The user's email
   * @returns True if reset email was sent
   */
  async sendPasswordResetEmail(email: string): Promise<boolean> {
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
    } catch (error: any) {
      console.error(
        '[KeycloakAPI] Error sending password reset email:',
        error.response?.data || error.message
      );
      return false;
    }
  }

  /**
   * Check if user belongs to gruenerator source (internal users)
   * @param user - The user object
   * @returns True if user is from gruenerator source
   */
  isGrueneratorUser(user: KeycloakUser | null): boolean {
    if (!user) return false;

    // Check if user has any federated identity (external source)
    // If no federated identity, it's a local Keycloak user (gruenerator)
    return !user.federatedIdentities || user.federatedIdentities.length === 0;
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log('[KeycloakAPI] Testing connection...');

      await this.ensureAuth();

      // Test with a simple realm info request
      await this.axiosClient.get('/');

      console.log('[KeycloakAPI] ✅ Connection successful');
      return true;
    } catch (error: any) {
      console.error('[KeycloakAPI] ❌ Connection test failed:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Get user's federated identities (external providers)
   * @param userId - The user ID
   * @returns Array of federated identities
   */
  async getUserFederatedIdentities(userId: string): Promise<FederatedIdentity[]> {
    try {
      await this.ensureAuth();

      const response = await this.axiosClient.get<FederatedIdentity[]>(
        `/users/${userId}/federated-identity`
      );
      return response.data;
    } catch (error: any) {
      console.error(
        '[KeycloakAPI] Error getting federated identities:',
        error.response?.data || error.message
      );
      return [];
    }
  }
}
