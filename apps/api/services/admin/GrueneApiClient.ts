/**
 * GrueneApiClient - API communication with Grüne platform
 *
 * Handles authentication and API calls for offboarding operations
 */

import axios, { type AxiosInstance } from 'axios';
import { createLogger } from '../../utils/logger.js';
import type {
  GrueneApiConfig,
  OffboardingUsersResponse,
  BatchUpdateEntry
} from './types.js';

const log = createLogger('GrueneApiClient');

export class GrueneApiClient {
  private baseUrl: string;
  private username?: string;
  private password?: string;
  private apiKey?: string;
  private client: AxiosInstance;

  constructor(config: GrueneApiConfig) {
    this.baseUrl = config.GRUENE_API_BASEURL;
    this.username = config.GRUENE_API_USERNAME;
    this.password = config.GRUENE_API_PASSWORD;
    this.apiKey = config.GRUENE_API_KEY;

    // Create axios instance with retry configuration
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      }
    });

    // Setup authentication
    if (this.apiKey) {
      this.client.defaults.headers['x-api-key'] = this.apiKey;
    } else if (this.username && this.password) {
      this.client.defaults.auth = {
        username: this.username,
        password: this.password
      };
    }
  }

  /**
   * Fetch users that need offboarding
   * @param limit - Maximum number of users to fetch
   * @param after - Cursor for pagination
   * @returns Response with users and pagination metadata
   */
  async findUsersToOffboard(limit: number = 1000, after: string | null = null): Promise<OffboardingUsersResponse> {
    try {
      const response = await this.client.get<OffboardingUsersResponse>('/v1/offboarding/users/self', {
        params: { limit, after }
      });
      return response.data;
    } catch (error: any) {
      log.error('Failed to fetch users from Grüne API:', error.message);
      throw error;
    }
  }

  /**
   * Report batch of processed users back to API
   * @param upserts - Array of user processing results
   * @returns API response
   */
  async batchUpdateOffboardingUsers(upserts: BatchUpdateEntry[]): Promise<any> {
    try {
      const response = await this.client.post('/v1/offboarding/users/self/batch', {
        upsert: upserts
      });
      return response.data;
    } catch (error: any) {
      log.error('Failed to report processed users to Grüne API:', error.message);
      throw error;
    }
  }
}
